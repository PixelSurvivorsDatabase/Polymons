alter table public.games
  add column studio_project_id uuid;

create unique index games_owner_studio_project_idx
  on public.games (owner_id, studio_project_id)
  where studio_project_id is not null;

create index friendships_status_updated_idx
  on public.friendships (status, updated_at desc);

grant select, insert, update, delete on table public.games to authenticated;
grant select, insert, update, delete on table public.game_versions to authenticated;
