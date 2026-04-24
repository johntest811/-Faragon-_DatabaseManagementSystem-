-- Paste into the Supabase SQL editor.
-- This file hardens mutable functions and removes the public storage listing
-- policies that are no longer needed now that uploads use unique object paths.
-- It is safe to rerun.

do $$
declare
  target_name text;
  proc_row record;
begin
  foreach target_name in array array[
    'set_updated_at',
    'archive_applicant',
    'is_superadmin',
    'has_module_access',
    'trg_sync_admin_role_to_app_roles',
    'trg_ensure_role_module_access_for_column_access',
    'set_updated_at_timestamp',
    'enforce_retired_fields',
    'set_audit_log_retention_settings_updated_at',
    'trg_fill_retired_fields_on_applicants'
  ]
  loop
    for proc_row in
      select
        n.nspname as schema_name,
        p.proname as function_name,
        pg_get_function_identity_arguments(p.oid) as identity_arguments
      from pg_proc p
      join pg_namespace n
        on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = target_name
    loop
      execute format(
        'alter function %I.%I(%s) set search_path = public',
        proc_row.schema_name,
        proc_row.function_name,
        proc_row.identity_arguments
      );
    end loop;
  end loop;
end
$$;

drop policy if exists "ALL 1szhwhd_1" on storage.objects;
drop policy if exists "ALL 6j30sc_0" on storage.objects;
drop policy if exists "ALL m5vmtg_0" on storage.objects;
drop policy if exists "All mev895_0" on storage.objects;
drop policy if exists profile_bucket_public_read on storage.objects;
drop policy if exists profile_bucket_public_update on storage.objects;

-- Keep upload and cleanup capabilities intact.
-- The app writes new unique object paths and removes old files explicitly,
-- so public listing policies are no longer needed for these buckets.