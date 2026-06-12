alter table public.games
  add column if not exists visit_count bigint not null default 0
  check (visit_count >= 0);

create or replace function public.increment_game_visit(target_game_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.games
  set visit_count = visit_count + 1
  where id = target_game_id;
$$;

revoke all on function public.increment_game_visit(uuid)
  from public, anon, authenticated;
grant execute on function public.increment_game_visit(uuid) to service_role;
