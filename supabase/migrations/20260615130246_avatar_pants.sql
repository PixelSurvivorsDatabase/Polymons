alter table public.avatar_items
  drop constraint avatar_items_type;

alter table public.avatar_items
  add constraint avatar_items_type check (item_type in ('shirt', 'pants'));

insert into public.avatar_items (
  id,
  name,
  description,
  item_type,
  unlock_type,
  unlock_threshold,
  sort_order
)
values
  (
    'classic-denim-pants',
    'Classic Denim Pants',
    'Simple blue block pants with dark shoes.',
    'pants',
    'free',
    null,
    110
  ),
  (
    'polymon-pants',
    'Polymon Pants',
    'Black and purple pants made to match the Polymon Shirt.',
    'pants',
    'free',
    null,
    120
  );

alter table public.profiles
  add column equipped_pants_id text
  references public.avatar_items (id)
  on delete set null;

insert into public.user_avatar_items (user_id, item_id)
select id, 'classic-denim-pants'
from public.profiles
on conflict do nothing;

update public.profiles
set equipped_pants_id = 'classic-denim-pants'
where equipped_pants_id is null;

create or replace function private.grant_default_avatar_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_avatar_items (user_id, item_id)
  values
    (new.id, 'polymon-shirt'),
    (new.id, 'classic-denim-pants')
  on conflict do nothing;

  update public.profiles
  set
    equipped_shirt_id = coalesce(equipped_shirt_id, 'polymon-shirt'),
    equipped_pants_id = coalesce(equipped_pants_id, 'classic-denim-pants')
  where id = new.id;

  return new;
end;
$$;
