-- Paste into the Supabase SQL editor.
-- This hardens every warning-targeted public function/trigger helper by forcing
-- an explicit search_path. It is safe to rerun.

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
    'set_audit_log_retention_settings_updated_at'
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