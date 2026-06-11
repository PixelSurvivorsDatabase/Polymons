create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  requested_display_name text;
  reserved_usernames constant text[] := array[
    'admin',
    'administrator',
    'api',
    'help',
    'moderator',
    'polymons',
    'staff',
    'support',
    'system'
  ];
begin
  requested_username := lower(trim(coalesce(
    new.raw_user_meta_data ->> 'username',
    ''
  )));

  if requested_username !~ '^[a-z0-9][a-z0-9_]{2,19}$' then
    raise exception 'invalid username';
  end if;

  if requested_username = any(reserved_usernames)
    and coalesce(new.raw_app_meta_data ->> 'account_kind', '') <> 'official_locked'
  then
    raise exception 'reserved username';
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
