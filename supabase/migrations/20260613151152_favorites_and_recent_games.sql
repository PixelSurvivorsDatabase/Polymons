create table public.game_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index game_favorites_user_created_idx
  on public.game_favorites (user_id, created_at desc);

create table public.recent_games (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  last_played_at timestamptz not null default now(),
  play_count bigint not null default 1 check (play_count > 0),
  primary key (user_id, game_id)
);

create index recent_games_user_played_idx
  on public.recent_games (user_id, last_played_at desc);

alter table public.game_favorites enable row level security;
alter table public.recent_games enable row level security;

create policy users_manage_their_game_favorites
on public.game_favorites
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy users_read_their_recent_games
on public.recent_games
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.game_favorites from anon, authenticated;
grant select, insert, delete on table public.game_favorites to authenticated;
grant all on table public.game_favorites to service_role;

revoke all on table public.recent_games from anon, authenticated;
grant select on table public.recent_games to authenticated;
grant all on table public.recent_games to service_role;
