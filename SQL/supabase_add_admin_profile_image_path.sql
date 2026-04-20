-- Adds admins.profile_image_path and provisions a public storage bucket named Profile.
-- Safe to run multiple times.

begin;

alter table if exists public.admins
  add column if not exists profile_image_path text;

comment on column public.admins.profile_image_path
  is 'Path to admin avatar image in storage bucket Profile';

insert into storage.buckets (id, name, public)
values ('Profile', 'Profile', true)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_bucket_public_read'
  ) then
    create policy profile_bucket_public_read
      on storage.objects
      for select
      to public
      using (bucket_id = 'Profile');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_bucket_public_insert'
  ) then
    create policy profile_bucket_public_insert
      on storage.objects
      for insert
      to public
      with check (bucket_id = 'Profile');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_bucket_public_update'
  ) then
    create policy profile_bucket_public_update
      on storage.objects
      for update
      to public
      using (bucket_id = 'Profile')
      with check (bucket_id = 'Profile');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_bucket_public_delete'
  ) then
    create policy profile_bucket_public_delete
      on storage.objects
      for delete
      to public
      using (bucket_id = 'Profile');
  end if;
end $$;

commit;
