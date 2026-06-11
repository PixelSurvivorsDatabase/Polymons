create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username = lower(username)
    and username ~ '^[a-z0-9][a-z0-9_]{2,19}$'
  ),
  constraint profiles_display_name_length check (
    char_length(display_name) between 1 and 32
  ),
  constraint profiles_bio_length check (char_length(bio) <= 500)
);

create index profiles_username_search_idx
  on public.profiles using btree (lower(username) text_pattern_ops);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  requested_display_name text;
begin
  requested_username := lower(trim(coalesce(
    new.raw_user_meta_data ->> 'username',
    ''
  )));

  if requested_username !~ '^[a-z0-9][a-z0-9_]{2,19}$' then
    raise exception 'invalid username';
  end if;

  requested_display_name := trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    requested_username
  ));

  if char_length(requested_display_name) not between 1 and 32 then
    requested_display_name := requested_username;
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, requested_display_name);

  return new;
end;
$$;

create trigger create_profile_after_signup
after insert on auth.users
for each row execute function private.handle_new_user();

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint friendships_different_users check (requester_id <> addressee_id),
  constraint friendships_status check (
    status in ('pending', 'accepted', 'blocked')
  ),
  constraint friendships_accepted_at_matches_status check (
    (status = 'accepted') = (accepted_at is not null)
  )
);

create unique index friendships_unique_pair_idx
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index friendships_requester_idx
  on public.friendships (requester_id, status);

create index friendships_addressee_idx
  on public.friendships (addressee_id, status);

create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function private.set_updated_at();

create or replace function private.sync_friendship_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'accepted' then
    new.accepted_at = coalesce(old.accepted_at, now());
  else
    new.accepted_at = null;
  end if;

  return new;
end;
$$;

create trigger friendships_sync_status
before update on public.friendships
for each row execute function private.sync_friendship_status();

create table public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text not null default '',
  visibility text not null default 'draft',
  genre text not null default 'All',
  thumbnail_url text,
  platform_owned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_slug_format check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
  ),
  constraint games_title_length check (char_length(title) between 1 and 64),
  constraint games_description_length check (char_length(description) <= 2000),
  constraint games_visibility check (
    visibility in ('draft', 'unlisted', 'public')
  ),
  constraint games_owner_required check (
    (platform_owned and owner_id is null)
    or (not platform_owned and owner_id is not null)
  )
);

create index games_owner_idx on public.games (owner_id);
create index games_visibility_idx on public.games (visibility, updated_at desc);

create trigger games_set_updated_at
before update on public.games
for each row execute function private.set_updated_at();

create table public.game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft',
  manifest jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint game_versions_positive_version check (version_number > 0),
  constraint game_versions_status check (
    status in ('draft', 'published', 'retired')
  ),
  unique (game_id, version_number)
);

create index game_versions_game_idx
  on public.game_versions (game_id, version_number desc);

create table public.play_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  game_version_id uuid references public.game_versions (id) on delete restrict,
  ticket_hash text not null unique,
  server_id text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint play_sessions_expiry check (expires_at > created_at)
);

create index play_sessions_user_idx
  on public.play_sessions (user_id, created_at desc);

create index play_sessions_active_idx
  on public.play_sessions (expires_at)
  where consumed_at is null;

insert into public.games (
  id,
  slug,
  title,
  description,
  visibility,
  genre,
  platform_owned
)
values (
  '00000000-0000-4000-8000-000000000001',
  'baseplate',
  'Baseplate',
  'The internal Polymons testing ground for movement, physics, networking, and player development.',
  'public',
  'Internal test',
  true
);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.games enable row level security;
alter table public.game_versions enable row level security;
alter table public.play_sessions enable row level security;

create policy profiles_are_public
on public.profiles
for select
to anon, authenticated
using (true);

create policy users_update_their_profile
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy friendship_participants_can_read
on public.friendships
for select
to authenticated
using (
  (select auth.uid()) = requester_id
  or (select auth.uid()) = addressee_id
);

create policy users_can_send_friend_requests
on public.friendships
for insert
to authenticated
with check (
  (select auth.uid()) = requester_id
  and status = 'pending'
  and accepted_at is null
);

create policy recipients_can_answer_friend_requests
on public.friendships
for update
to authenticated
using ((select auth.uid()) = addressee_id)
with check (
  (select auth.uid()) = addressee_id
  and status in ('accepted', 'blocked')
);

create policy friendship_participants_can_delete
on public.friendships
for delete
to authenticated
using (
  (select auth.uid()) = requester_id
  or (select auth.uid()) = addressee_id
);

create policy visible_games_are_readable
on public.games
for select
to anon, authenticated
using (
  visibility = 'public'
  or (select auth.uid()) = owner_id
);

create policy users_can_create_games
on public.games
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and not platform_owned
);

create policy owners_can_update_games
on public.games
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and not platform_owned
);

create policy owners_can_delete_games
on public.games
for delete
to authenticated
using (
  (select auth.uid()) = owner_id
  and not platform_owned
);

create policy visible_game_versions_are_readable
on public.game_versions
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.games
    where games.id = game_versions.game_id
      and (
        games.visibility = 'public'
        or games.owner_id = (select auth.uid())
      )
  )
);

create policy owners_can_create_game_versions
on public.game_versions
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.games
    where games.id = game_versions.game_id
      and games.owner_id = (select auth.uid())
  )
);

create policy owners_can_update_game_versions
on public.game_versions
for update
to authenticated
using (
  exists (
    select 1
    from public.games
    where games.id = game_versions.game_id
      and games.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.games
    where games.id = game_versions.game_id
      and games.owner_id = (select auth.uid())
  )
);

create policy owners_can_delete_game_versions
on public.game_versions
for delete
to authenticated
using (
  exists (
    select 1
    from public.games
    where games.id = game_versions.game_id
      and games.owner_id = (select auth.uid())
  )
);

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update (display_name, bio, avatar_url)
  on table public.profiles to authenticated;

revoke all on table public.friendships from anon, authenticated;
grant select, insert, delete on table public.friendships to authenticated;
grant update (status) on table public.friendships to authenticated;

revoke all on table public.games from anon, authenticated;
grant select on table public.games to anon, authenticated;
grant insert, update, delete on table public.games to authenticated;

revoke all on table public.game_versions from anon, authenticated;
grant select on table public.game_versions to anon, authenticated;
grant insert, update, delete
  on table public.game_versions to authenticated;

revoke all on table public.play_sessions from anon, authenticated;
grant all on table public.play_sessions to service_role;
