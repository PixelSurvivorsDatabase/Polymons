begin;

lock table public.profiles in share row exclusive mode;

create sequence public.polymons_id_seq
  as bigint
  start with 3
  increment by 1
  minvalue 1;

alter table public.profiles
  add column polymons_id bigint;

update public.profiles
set polymons_id = case username
  when 'polymons' then 1
  when 'lava' then 2
end
where username in ('polymons', 'lava');

with numbered_profiles as (
  select
    id,
    row_number() over (order by created_at, id) + 2 as polymons_id
  from public.profiles
  where polymons_id is null
)
update public.profiles as profiles
set polymons_id = numbered_profiles.polymons_id
from numbered_profiles
where profiles.id = numbered_profiles.id;

select setval(
  'public.polymons_id_seq',
  greatest(
    2,
    coalesce((select max(polymons_id) from public.profiles), 2)
  ),
  true
);

alter sequence public.polymons_id_seq
  owned by public.profiles.polymons_id;

alter table public.profiles
  alter column polymons_id
  set default nextval('public.polymons_id_seq'),
  alter column polymons_id
  set not null,
  add constraint profiles_polymons_id_positive check (polymons_id > 0),
  add constraint profiles_polymons_id_unique unique (polymons_id);

commit;
