create table public.player_account_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ticket_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint player_account_links_expiry check (expires_at > created_at)
);

create index player_account_links_active_idx
  on public.player_account_links (expires_at)
  where consumed_at is null;

alter table public.player_account_links enable row level security;

revoke all on table public.player_account_links from anon, authenticated;
grant all on table public.player_account_links to service_role;
