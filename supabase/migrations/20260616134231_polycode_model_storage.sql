insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'polycode-models',
  'polycode-models',
  false,
  600000000,
  array[
    'application/octet-stream',
    'application/x-pytorch',
    'application/zip'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Owners can read PolyCode model artifacts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'polycode-models'
  and exists (
    select 1
    from auth.users owner_user
    where owner_user.id = auth.uid()
      and owner_user.raw_app_meta_data->>'role' = 'owner'
  )
);

create policy "Owners can upload PolyCode model artifacts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'polycode-models'
  and exists (
    select 1
    from auth.users owner_user
    where owner_user.id = auth.uid()
      and owner_user.raw_app_meta_data->>'role' = 'owner'
  )
);

create policy "Owners can update PolyCode model artifacts"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'polycode-models'
  and exists (
    select 1
    from auth.users owner_user
    where owner_user.id = auth.uid()
      and owner_user.raw_app_meta_data->>'role' = 'owner'
  )
)
with check (
  bucket_id = 'polycode-models'
  and exists (
    select 1
    from auth.users owner_user
    where owner_user.id = auth.uid()
      and owner_user.raw_app_meta_data->>'role' = 'owner'
  )
);

create policy "Owners can delete PolyCode model artifacts"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'polycode-models'
  and exists (
    select 1
    from auth.users owner_user
    where owner_user.id = auth.uid()
      and owner_user.raw_app_meta_data->>'role' = 'owner'
  )
);
