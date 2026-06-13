create table public.avatar_items (
  id text primary key,
  name text not null,
  description text not null default '',
  item_type text not null default 'shirt',
  unlock_type text not null default 'free',
  unlock_threshold bigint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint avatar_items_id_format check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  constraint avatar_items_type check (item_type in ('shirt')),
  constraint avatar_items_unlock_type check (
    unlock_type in ('free', 'creator_visits')
  ),
  constraint avatar_items_unlock_threshold check (
    (unlock_type = 'free' and unlock_threshold is null)
    or
    (unlock_type = 'creator_visits' and unlock_threshold is not null)
  )
);

insert into public.avatar_items (
  id,
  name,
  description,
  unlock_type,
  unlock_threshold,
  sort_order
)
values
  (
    'polymon-shirt',
    'Polymon Shirt',
    'The original black and purple Polymons shirt.',
    'free',
    null,
    10
  ),
  (
    'beta-tester-shirt',
    'Beta Tester Shirt',
    'A flowing green, red, and purple shirt for early players.',
    'free',
    null,
    20
  ),
  (
    'creators-shirt',
    'Creator''s Shirt',
    'Polymons Approved. Unlocked after your games reach 100 total visits.',
    'creator_visits',
    100,
    30
  );

alter table public.profiles
  add column equipped_shirt_id text
  references public.avatar_items (id)
  on delete set null;

create table public.user_avatar_items (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.avatar_items (id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index user_avatar_items_user_idx
  on public.user_avatar_items (user_id, acquired_at desc);

insert into public.user_avatar_items (user_id, item_id)
select id, 'polymon-shirt'
from public.profiles
on conflict do nothing;

update public.profiles
set equipped_shirt_id = 'polymon-shirt'
where equipped_shirt_id is null;

create or replace function private.grant_default_avatar_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_avatar_items (user_id, item_id)
  values (new.id, 'polymon-shirt')
  on conflict do nothing;

  update public.profiles
  set equipped_shirt_id = 'polymon-shirt'
  where id = new.id
    and equipped_shirt_id is null;

  return new;
end;
$$;

create trigger grant_default_avatar_items_after_profile
after insert on public.profiles
for each row execute function private.grant_default_avatar_items();

alter table public.avatar_items enable row level security;
alter table public.user_avatar_items enable row level security;

create policy avatar_items_are_public
on public.avatar_items
for select
to anon, authenticated
using (true);

create policy users_can_read_their_avatar_items
on public.user_avatar_items
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.avatar_items from anon, authenticated;
grant select on table public.avatar_items to anon, authenticated;

revoke all on table public.user_avatar_items from anon, authenticated;
grant select on table public.user_avatar_items to authenticated;
grant all on table public.avatar_items to service_role;
grant all on table public.user_avatar_items to service_role;
