alter table public.avatar_items
  drop constraint if exists avatar_items_type;

alter table public.avatar_items
  add constraint avatar_items_type check (item_type in ('shirt', 'pants', 'hair', 'hat'));

alter table public.avatar_items
  add column if not exists model_url text,
  add column if not exists model_format text,
  add column if not exists model_preview_url text;

alter table public.avatar_items
  drop constraint if exists avatar_items_model_format_check,
  add constraint avatar_items_model_format_check
    check (
      model_format is null
      or model_format in ('glb', 'gltf', 'obj', 'fbx', 'stl', 'dae', 'zip', 'rbxm', 'rbxmx', 'rblx', 'rbxlx')
    );

alter table public.profiles
  add column if not exists equipped_hair_id text
    references public.avatar_items (id)
    on delete set null,
  add column if not exists equipped_hat_id text
    references public.avatar_items (id)
    on delete set null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatar-item-models',
  'avatar-item-models',
  true,
  8000000,
  array[
    'model/gltf-binary',
    'model/gltf+json',
    'model/obj',
    'model/stl',
    'application/octet-stream',
    'application/json',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
    'application/xml',
    'text/xml'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
