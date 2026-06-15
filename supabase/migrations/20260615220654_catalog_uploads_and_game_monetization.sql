alter table public.avatar_items
  add column if not exists creator_id uuid references public.profiles (id) on delete set null,
  add column if not exists texture_url text,
  add column if not exists review_status text not null default 'approved',
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text not null default '',
  add column if not exists created_from_upload boolean not null default false;

alter table public.avatar_items
  drop constraint if exists avatar_items_review_status_check,
  add constraint avatar_items_review_status_check
    check (review_status in ('pending', 'approved', 'rejected'));

alter table public.avatar_items
  drop constraint if exists avatar_items_rejection_reason_length,
  add constraint avatar_items_rejection_reason_length
    check (char_length(rejection_reason) <= 500);

create index if not exists avatar_items_review_status_idx
  on public.avatar_items (review_status, created_at desc);

create index if not exists avatar_items_creator_upload_day_idx
  on public.avatar_items (creator_id, created_at desc)
  where created_from_upload = true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatar-item-textures',
  'avatar-item-textures',
  true,
  2000000,
  array['image/png']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.game_passes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text not null default '',
  price_tix integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_passes_name_length check (char_length(name) between 1 and 64),
  constraint game_passes_description_length check (char_length(description) <= 500),
  constraint game_passes_price check (price_tix >= 0 and price_tix <= 1000000),
  constraint game_passes_game_name_unique unique (game_id, name)
);

create trigger game_passes_set_updated_at
before update on public.game_passes
for each row execute function private.set_updated_at();

create table if not exists public.user_game_passes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_pass_id uuid not null references public.game_passes (id) on delete cascade,
  purchased_at timestamptz not null default now(),
  primary key (user_id, game_pass_id)
);

create table if not exists public.game_player_data (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create trigger game_player_data_set_updated_at
before update on public.game_player_data
for each row execute function private.set_updated_at();

create table if not exists public.developer_products (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text not null default '',
  price_tix integer not null default 0,
  effect_key text,
  effect_amount numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_products_name_length check (char_length(name) between 1 and 64),
  constraint developer_products_description_length check (char_length(description) <= 500),
  constraint developer_products_price check (price_tix >= 0 and price_tix <= 1000000),
  constraint developer_products_effect_key_length check (
    effect_key is null or effect_key ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'
  ),
  constraint developer_products_game_name_unique unique (game_id, name)
);

create trigger developer_products_set_updated_at
before update on public.developer_products
for each row execute function private.set_updated_at();

create table if not exists public.developer_product_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.developer_products (id) on delete cascade,
  quantity integer not null default 1,
  purchased_at timestamptz not null default now(),
  constraint developer_product_purchases_quantity check (quantity > 0 and quantity <= 1000)
);

create index if not exists game_passes_game_idx
  on public.game_passes (game_id, is_active, created_at);

create index if not exists developer_products_game_idx
  on public.developer_products (game_id, is_active, created_at);

create index if not exists developer_product_purchases_user_idx
  on public.developer_product_purchases (user_id, purchased_at desc);

alter table public.game_passes enable row level security;
alter table public.user_game_passes enable row level security;
alter table public.developer_products enable row level security;
alter table public.developer_product_purchases enable row level security;
alter table public.game_player_data enable row level security;

revoke all on table public.game_passes from anon, authenticated;
revoke all on table public.user_game_passes from anon, authenticated;
revoke all on table public.developer_products from anon, authenticated;
revoke all on table public.developer_product_purchases from anon, authenticated;
revoke all on table public.game_player_data from anon, authenticated;

grant all on table public.game_passes to service_role;
grant all on table public.user_game_passes to service_role;
grant all on table public.developer_products to service_role;
grant all on table public.developer_product_purchases to service_role;
grant all on table public.game_player_data to service_role;

create or replace function public.purchase_avatar_item_with_tix(
  target_user_id uuid,
  target_item_id text
)
returns table(balance bigint, purchased_item_ids text[])
language plpgsql
security invoker
set search_path = public
as $$
declare
  item_price integer;
  item_bundle text;
  item_creator uuid;
  current_balance bigint;
  requested_items text[];
begin
  select avatar_items.price_tix, avatar_items.bundle_key, avatar_items.creator_id
    into item_price, item_bundle, item_creator
  from public.avatar_items
  where avatar_items.id = target_item_id
    and avatar_items.unlock_type = 'tix'
    and avatar_items.review_status = 'approved';

  if item_price is null then
    raise exception 'avatar item not found';
  end if;

  select array_agg(avatar_items.id order by avatar_items.sort_order)
    into requested_items
  from public.avatar_items
  where avatar_items.review_status = 'approved'
    and (
      avatar_items.id = target_item_id
      or (item_bundle is not null and avatar_items.bundle_key = item_bundle)
    );

  if requested_items is null or array_length(requested_items, 1) is null then
    raise exception 'avatar item not found';
  end if;

  select profiles.tix into current_balance
  from public.profiles
  where profiles.id = target_user_id
  for update;

  if current_balance is null then
    raise exception 'profile not found';
  end if;

  if not exists (
    select 1
    from unnest(requested_items) as requested_item(item_id)
    where not exists (
      select 1
      from public.user_avatar_items
      where user_avatar_items.user_id = target_user_id
        and user_avatar_items.item_id = requested_item.item_id
    )
  ) then
    balance := current_balance;
    purchased_item_ids := requested_items;
    return next;
  end if;

  if current_balance < item_price then
    raise exception 'not enough tix';
  end if;

  update public.profiles
  set tix = tix - item_price
  where id = target_user_id
  returning tix into current_balance;

  if item_creator is not null and item_creator <> target_user_id and item_price > 0 then
    update public.profiles
    set tix = tix + item_price
    where id = item_creator;
  end if;

  insert into public.user_avatar_items (user_id, item_id)
  select target_user_id, unnest(requested_items)
  on conflict (user_id, item_id) do nothing;

  balance := current_balance;
  purchased_item_ids := requested_items;
  return next;
end;
$$;

create or replace function public.purchase_game_pass_with_tix(
  target_user_id uuid,
  target_game_pass_id uuid
)
returns table(balance bigint, pass_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  pass_price integer;
  pass_creator uuid;
  current_balance bigint;
begin
  select price_tix, creator_id into pass_price, pass_creator
  from public.game_passes
  where id = target_game_pass_id
    and is_active = true;

  if pass_price is null then
    raise exception 'game pass not found';
  end if;

  if exists (
    select 1 from public.user_game_passes
    where user_id = target_user_id and game_pass_id = target_game_pass_id
  ) then
    select tix into current_balance from public.profiles where id = target_user_id;
    balance := current_balance;
    pass_id := target_game_pass_id;
    return next;
  end if;

  select tix into current_balance
  from public.profiles
  where id = target_user_id
  for update;

  if current_balance < pass_price then
    raise exception 'not enough tix';
  end if;

  update public.profiles
  set tix = tix - pass_price
  where id = target_user_id
  returning tix into current_balance;

  if pass_creator <> target_user_id and pass_price > 0 then
    update public.profiles set tix = tix + pass_price where id = pass_creator;
  end if;

  insert into public.user_game_passes (user_id, game_pass_id)
  values (target_user_id, target_game_pass_id)
  on conflict (user_id, game_pass_id) do nothing;

  balance := current_balance;
  pass_id := target_game_pass_id;
  return next;
end;
$$;

create or replace function public.purchase_developer_product_with_tix(
  target_user_id uuid,
  target_product_id uuid
)
returns table(balance bigint, purchase_id uuid, player_data jsonb)
language plpgsql
security invoker
set search_path = public
as $$
declare
  product_price integer;
  product_creator uuid;
  product_game uuid;
  product_effect_key text;
  product_effect_amount numeric;
  current_balance bigint;
  new_purchase_id uuid;
  current_data jsonb;
  old_value numeric;
begin
  select price_tix, creator_id, game_id, effect_key, effect_amount
    into product_price, product_creator, product_game, product_effect_key, product_effect_amount
  from public.developer_products
  where id = target_product_id
    and is_active = true;

  if product_price is null then
    raise exception 'developer product not found';
  end if;

  select tix into current_balance
  from public.profiles
  where id = target_user_id
  for update;

  if current_balance < product_price then
    raise exception 'not enough tix';
  end if;

  update public.profiles
  set tix = tix - product_price
  where id = target_user_id
  returning tix into current_balance;

  if product_creator <> target_user_id and product_price > 0 then
    update public.profiles set tix = tix + product_price where id = product_creator;
  end if;

  insert into public.developer_product_purchases (user_id, product_id)
  values (target_user_id, target_product_id)
  returning id into new_purchase_id;

  insert into public.game_player_data (game_id, user_id, data)
  values (product_game, target_user_id, '{}'::jsonb)
  on conflict (game_id, user_id) do nothing;

  select data into current_data
  from public.game_player_data
  where game_id = product_game and user_id = target_user_id
  for update;

  if product_effect_key is not null and product_effect_amount <> 0 then
    old_value := coalesce((current_data ->> product_effect_key)::numeric, 0);
    current_data := jsonb_set(
      current_data,
      array[product_effect_key],
      to_jsonb(old_value + product_effect_amount),
      true
    );
    update public.game_player_data
    set data = current_data
    where game_id = product_game and user_id = target_user_id;
  end if;

  balance := current_balance;
  purchase_id := new_purchase_id;
  player_data := current_data;
  return next;
end;
$$;

create or replace function public.player_has_game_badge(
  target_user_id uuid,
  target_game_id uuid,
  target_badge_name text
)
returns boolean
language sql
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.player_badges
    join public.game_badges on game_badges.id = player_badges.badge_id
    where player_badges.user_id = target_user_id
      and game_badges.game_id = target_game_id
      and lower(game_badges.name) = lower(target_badge_name)
  );
$$;

revoke all on function public.purchase_avatar_item_with_tix(uuid, text)
  from public, anon, authenticated;
revoke all on function public.purchase_game_pass_with_tix(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.purchase_developer_product_with_tix(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.player_has_game_badge(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.purchase_avatar_item_with_tix(uuid, text)
  to service_role;
grant execute on function public.purchase_game_pass_with_tix(uuid, uuid)
  to service_role;
grant execute on function public.purchase_developer_product_with_tix(uuid, uuid)
  to service_role;
grant execute on function public.player_has_game_badge(uuid, uuid, text)
  to service_role;
