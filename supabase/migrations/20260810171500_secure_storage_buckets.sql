-- Make every application bucket private and enforce module-aware Storage RLS.

begin;

update storage.buckets
set public = false
where id in ('applicants', 'certificates', 'licensure', 'Profile', 'inventory', 'paraphernalia');

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end
$$;

create policy application_storage_read
on storage.objects for select to authenticated
using (
  private.is_active_admin()
  and case
    when bucket_id = 'Profile' then true
    when bucket_id in ('applicants', 'certificates', 'licensure') then
      private.has_any_module_access(
        array['applicants', 'employees', 'reassign', 'resigned', 'retired', 'floating', 'archive'],
        false
      )
    when bucket_id = 'inventory' then private.has_module_access('inventory', false)
    when bucket_id = 'paraphernalia' then private.has_module_access('paraphernalia', false)
    else false
  end
);

create policy application_storage_insert
on storage.objects for insert to authenticated
with check (
  private.is_active_admin()
  and case
    when bucket_id = 'Profile' then
      private.is_superadmin()
      or (storage.foldername(name))[1] = private.current_admin_id()::text
    when bucket_id in ('applicants', 'certificates', 'licensure') then
      private.has_any_module_access(array['applicants', 'employees'], true)
    when bucket_id = 'inventory' then private.has_module_access('inventory', true)
    when bucket_id = 'paraphernalia' then private.has_module_access('paraphernalia', true)
    else false
  end
);

create policy application_storage_update
on storage.objects for update to authenticated
using (
  private.is_active_admin()
  and case
    when bucket_id = 'Profile' then
      private.is_superadmin()
      or (storage.foldername(name))[1] = private.current_admin_id()::text
    when bucket_id in ('applicants', 'certificates', 'licensure') then
      private.has_any_module_access(array['applicants', 'employees'], true)
    when bucket_id = 'inventory' then private.has_module_access('inventory', true)
    when bucket_id = 'paraphernalia' then private.has_module_access('paraphernalia', true)
    else false
  end
)
with check (
  private.is_active_admin()
  and case
    when bucket_id = 'Profile' then
      private.is_superadmin()
      or (storage.foldername(name))[1] = private.current_admin_id()::text
    when bucket_id in ('applicants', 'certificates', 'licensure') then
      private.has_any_module_access(array['applicants', 'employees'], true)
    when bucket_id = 'inventory' then private.has_module_access('inventory', true)
    when bucket_id = 'paraphernalia' then private.has_module_access('paraphernalia', true)
    else false
  end
);

create policy application_storage_delete
on storage.objects for delete to authenticated
using (
  private.is_active_admin()
  and case
    when bucket_id = 'Profile' then
      private.is_superadmin()
      or (storage.foldername(name))[1] = private.current_admin_id()::text
    when bucket_id in ('applicants', 'certificates', 'licensure') then
      private.has_any_module_access(array['applicants', 'employees'], true)
    when bucket_id = 'inventory' then private.has_module_access('inventory', true)
    when bucket_id = 'paraphernalia' then private.has_module_access('paraphernalia', true)
    else false
  end
);

commit;
