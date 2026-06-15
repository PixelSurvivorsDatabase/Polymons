alter table public.profiles
  add column if not exists tix bigint not null default 0
    check (tix >= 0),
  add column if not exists tix_play_seconds integer not null default 0
    check (tix_play_seconds between 0 and 59),
  add column if not exists last_daily_tix_at date not null default date '1970-01-01';

alter table public.avatar_items
  add column if not exists price_tix bigint not null default 0
    check (price_tix >= 0),
  add column if not exists bundle_key text;

alter table public.avatar_items
  drop constraint if exists avatar_items_unlock_type,
  drop constraint if exists avatar_items_unlock_type_check,
  drop constraint if exists avatar_items_unlock_threshold;

alter table public.avatar_items
  add constraint avatar_items_unlock_type_check
  check (unlock_type in ('free', 'creator_visits', 'tix')),
  add constraint avatar_items_unlock_threshold check (
    (unlock_type = 'free' and unlock_threshold is null and price_tix = 0)
    or
    (
      unlock_type = 'creator_visits'
      and unlock_threshold is not null
      and price_tix = 0
    )
    or
    (unlock_type = 'tix' and unlock_threshold is null and price_tix > 0)
  );

update public.avatar_items
set
  unlock_type = 'tix',
  unlock_threshold = null,
  price_tix = 400,
  bundle_key = 'polymons-varsity-set'
where id in ('polymons-varsity-jacket', 'polymons-varsity-pants');

create table public.creator_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, creator_id),
  constraint creator_follows_different_users check (follower_id <> creator_id)
);

create index creator_follows_creator_idx
  on public.creator_follows (creator_id, created_at desc);

create table public.game_badges (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text not null default '',
  icon_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_badges_name_length check (char_length(name) between 1 and 64),
  constraint game_badges_description_length check (
    char_length(description) <= 500
  ),
  unique (game_id, name)
);

create index game_badges_game_idx
  on public.game_badges (game_id, created_at);

create trigger game_badges_set_updated_at
before update on public.game_badges
for each row execute function private.set_updated_at();

create table public.player_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id uuid not null references public.game_badges (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index player_badges_user_awarded_idx
  on public.player_badges (user_id, awarded_at desc);

alter table public.creator_follows enable row level security;
alter table public.game_badges enable row level security;
alter table public.player_badges enable row level security;

revoke all on table public.creator_follows from anon, authenticated;
revoke all on table public.game_badges from anon, authenticated;
revoke all on table public.player_badges from anon, authenticated;

grant all on table public.creator_follows to service_role;
grant all on table public.game_badges to service_role;
grant all on table public.player_badges to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'badge-icons',
  'badge-icons',
  true,
  1000000,
  array['image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.claim_daily_tix(target_user_id uuid)
returns table (balance bigint, awarded bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with claimed as (
    update public.profiles
    set
      tix = tix + 10,
      last_daily_tix_at = current_date
    where id = target_user_id
      and last_daily_tix_at < current_date
    returning tix
  )
  select claimed.tix, 10::bigint
  from claimed;

  if not found then
    return query
    select profiles.tix, 0::bigint
    from public.profiles
    where profiles.id = target_user_id;
  end if;
end;
$$;

create or replace function public.add_profile_playtime(
  target_user_id uuid,
  elapsed_seconds integer
)
returns table (balance bigint, awarded bigint, remainder_seconds integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if elapsed_seconds < 0 or elapsed_seconds > 600 then
    raise exception 'invalid playtime interval';
  end if;

  return query
  with current_profile as (
    select
      profiles.id,
      profiles.tix,
      profiles.tix_play_seconds,
      ((profiles.tix_play_seconds + elapsed_seconds) / 60)::bigint as granted,
      ((profiles.tix_play_seconds + elapsed_seconds) % 60)::integer as remainder
    from public.profiles
    where profiles.id = target_user_id
    for update
  ),
  updated as (
    update public.profiles
    set
      tix = current_profile.tix + current_profile.granted,
      tix_play_seconds = current_profile.remainder
    from current_profile
    where profiles.id = current_profile.id
    returning
      profiles.tix,
      current_profile.granted,
      profiles.tix_play_seconds
  )
  select updated.tix, updated.granted, updated.tix_play_seconds
  from updated;
end;
$$;

create or replace function public.adjust_profile_tix(
  target_user_id uuid,
  adjustment bigint,
  set_balance boolean default false
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_balance bigint;
begin
  update public.profiles
  set tix = case
    when set_balance then greatest(0, adjustment)
    else greatest(0, tix + adjustment)
  end
  where id = target_user_id
  returning tix into next_balance;

  if next_balance is null then
    raise exception 'profile not found';
  end if;
  return next_balance;
end;
$$;

create or replace function public.purchase_avatar_item_with_tix(
  target_user_id uuid,
  target_item_id text
)
returns table (balance bigint, purchased_item_ids text[])
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item_price bigint;
  item_bundle text;
  item_ids text[];
  current_balance bigint;
begin
  select avatar_items.price_tix, avatar_items.bundle_key
  into item_price, item_bundle
  from public.avatar_items
  where avatar_items.id = target_item_id
    and avatar_items.unlock_type = 'tix';

  if item_price is null then
    raise exception 'tix item not found';
  end if;

  select array_agg(avatar_items.id order by avatar_items.sort_order)
  into item_ids
  from public.avatar_items
  where avatar_items.id = target_item_id
     or (
       item_bundle is not null
       and avatar_items.bundle_key = item_bundle
     );

  if not exists (
    select 1
    from unnest(item_ids) as requested_item(item_id)
    where not exists (
      select 1
      from public.user_avatar_items
      where user_avatar_items.user_id = target_user_id
        and user_avatar_items.item_id = requested_item.item_id
    )
  ) then
    select profiles.tix into current_balance
    from public.profiles
    where profiles.id = target_user_id;
    return query select current_balance, item_ids;
    return;
  end if;

  update public.profiles
  set tix = tix - item_price
  where id = target_user_id
    and tix >= item_price
  returning tix into current_balance;

  if current_balance is null then
    raise exception 'not enough tix';
  end if;

  insert into public.user_avatar_items (user_id, item_id)
  select target_user_id, item_id
  from unnest(item_ids) as purchased(item_id)
  on conflict (user_id, item_id) do nothing;

  return query select current_balance, item_ids;
end;
$$;

create or replace function public.award_game_badge(
  target_user_id uuid,
  target_game_id uuid,
  target_badge_name text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_badge_id uuid;
begin
  select game_badges.id into selected_badge_id
  from public.game_badges
  where game_badges.game_id = target_game_id
    and lower(game_badges.name) = lower(target_badge_name)
  limit 1;

  if selected_badge_id is null then
    raise exception 'badge not found';
  end if;

  insert into public.player_badges (user_id, badge_id)
  values (target_user_id, selected_badge_id)
  on conflict (user_id, badge_id) do nothing;

  return selected_badge_id;
end;
$$;

create or replace function public.record_recent_game(
  target_user_id uuid,
  target_game_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.recent_games (
    user_id,
    game_id,
    last_played_at,
    play_count
  )
  values (target_user_id, target_game_id, now(), 1)
  on conflict (user_id, game_id) do update
  set
    last_played_at = excluded.last_played_at,
    play_count = public.recent_games.play_count + 1;
$$;

revoke all on function public.claim_daily_tix(uuid)
  from public, anon, authenticated;
revoke all on function public.add_profile_playtime(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.adjust_profile_tix(uuid, bigint, boolean)
  from public, anon, authenticated;
revoke all on function public.purchase_avatar_item_with_tix(uuid, text)
  from public, anon, authenticated;
revoke all on function public.award_game_badge(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.record_recent_game(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_daily_tix(uuid) to service_role;
grant execute on function public.add_profile_playtime(uuid, integer)
  to service_role;
grant execute on function public.adjust_profile_tix(uuid, bigint, boolean)
  to service_role;
grant execute on function public.purchase_avatar_item_with_tix(uuid, text)
  to service_role;
grant execute on function public.award_game_badge(uuid, uuid, text)
  to service_role;
grant execute on function public.record_recent_game(uuid, uuid)
  to service_role;
