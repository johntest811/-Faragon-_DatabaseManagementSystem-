-- Stage 2: enforce authenticated access and remove legacy plaintext passwords.
-- Run only after every public.admins row has auth_user_id/auth_email populated
-- and the new clients/Edge Functions have been deployed.

begin;

do $$
begin
  if exists (
    select 1
    from public.admins
    where auth_user_id is null or nullif(btrim(auth_email), '') is null
  ) then
    raise exception 'Cannot finalize security: one or more admin accounts are not linked to Supabase Auth.';
  end if;
end
$$;

alter table public.admins
  alter column auth_user_id set not null,
  alter column auth_email set not null;

alter table public.admins drop column if exists password;

-- No unauthenticated browser request may read or mutate application data.
revoke all on schema public from anon;
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;

grant usage on schema public to authenticated, service_role;
grant all privileges on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to service_role;

-- Authenticated clients only receive the non-secret admin profile columns.
revoke all on table public.admins from authenticated;
grant select (
  id, username, role, created_at, last_login, employee_id, employee_number,
  full_name, is_active, profile_image_path, assigned_detachment, applicant_id,
  auth_user_id, must_change_password, password_migrated_at
) on table public.admins to authenticated;
grant update (full_name, profile_image_path) on table public.admins to authenticated;

-- These functions are the only public RPCs required by the RBAC client.
grant execute on function public.current_role_name() to authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.has_module_access(text, boolean) to authenticated;
grant execute on function public.my_modules() to authenticated;

-- Remove every legacy policy from security-sensitive tables before replacing
-- it with an identity-aware policy.
do $$
declare
  target_table text;
  policy_row record;
  target_tables text[] := array[
    'admins',
    'app_roles',
    'modules',
    'role_module_access',
    'role_column_access',
    'role_paraphernalia_detachment_access',
    'admin_role_memberships',
    'admin_module_access_overrides',
    'admin_column_access_overrides',
    'admin_applicant_access_overrides',
    'admin_applicant_column_access_overrides',
    'admin_row_identifier_column_access_overrides',
    'admin_paraphernalia_access_settings',
    'admin_paraphernalia_detachment_access',
    'user_module_access_overrides',
    'user_column_access_overrides',
    'user_applicant_access_overrides',
    'user_applicant_column_access_overrides',
    'user_row_identifier_column_access_overrides',
    'admin_login_history',
    'audit_log',
    'audit_log_retention_settings',
    'notification_email_settings',
    'notification_preferences',
    'notification_log_retention_settings',
    'notification_delivery_claims',
    'licensure_notification_log',
    'other_expiration_notification_log',
    'contract_expiration_notification_log'
  ];
begin
  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', target_table);
    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, target_table);
    end loop;
  end loop;
end
$$;

create policy admins_select_own_or_superadmin
on public.admins for select to authenticated
using (id = private.current_admin_id() or private.is_superadmin());

create policy admins_update_own_profile
on public.admins for update to authenticated
using (id = private.current_admin_id())
with check (id = private.current_admin_id());

create policy app_roles_read_active_admin
on public.app_roles for select to authenticated
using (private.is_active_admin());
create policy app_roles_manage_superadmin
on public.app_roles for all to authenticated
using (private.is_superadmin())
with check (private.is_superadmin());

create policy modules_read_active_admin
on public.modules for select to authenticated
using (private.is_active_admin());
create policy modules_manage_superadmin
on public.modules for all to authenticated
using (private.is_superadmin())
with check (private.is_superadmin());

create policy role_module_access_read_own_or_superadmin
on public.role_module_access for select to authenticated
using (role_id = private.current_admin_role_id() or private.is_superadmin());
create policy role_module_access_manage_superadmin
on public.role_module_access for all to authenticated
using (private.is_superadmin())
with check (private.is_superadmin());

create policy role_column_access_read_own_or_superadmin
on public.role_column_access for select to authenticated
using (role_id = private.current_admin_role_id() or private.is_superadmin());
create policy role_column_access_manage_superadmin
on public.role_column_access for all to authenticated
using (private.is_superadmin())
with check (private.is_superadmin());

create policy role_paraphernalia_access_read_own_or_superadmin
on public.role_paraphernalia_detachment_access for select to authenticated
using (role_id = private.current_admin_role_id() or private.is_superadmin());
create policy role_paraphernalia_access_manage_superadmin
on public.role_paraphernalia_detachment_access for all to authenticated
using (private.is_superadmin())
with check (private.is_superadmin());

do $$
declare
  target_table text;
  target_tables text[] := array[
    'admin_module_access_overrides',
    'admin_column_access_overrides',
    'admin_applicant_access_overrides',
    'admin_applicant_column_access_overrides',
    'admin_row_identifier_column_access_overrides',
    'admin_paraphernalia_access_settings',
    'admin_paraphernalia_detachment_access'
  ];
begin
  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;
    execute format(
      'create policy %I on public.%I for select to authenticated using (admin_id = private.current_admin_id() or private.is_superadmin())',
      target_table || '_read_own_or_superadmin', target_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.is_superadmin()) with check (private.is_superadmin())',
      target_table || '_manage_superadmin', target_table
    );
  end loop;
end
$$;

do $$
declare
  target_table text;
  target_tables text[] := array[
    'user_module_access_overrides',
    'user_column_access_overrides',
    'user_applicant_access_overrides',
    'user_applicant_column_access_overrides',
    'user_row_identifier_column_access_overrides',
    'admin_role_memberships'
  ];
begin
  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()) or private.is_superadmin())',
      target_table || '_read_own_or_superadmin', target_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.is_superadmin()) with check (private.is_superadmin())',
      target_table || '_manage_superadmin', target_table
    );
  end loop;
end
$$;

create policy admin_login_history_read_superadmin
on public.admin_login_history for select to authenticated
using (private.is_superadmin());

create policy audit_log_read_superadmin
on public.audit_log for select to authenticated
using (private.is_superadmin());
create policy audit_log_insert_self
on public.audit_log for insert to authenticated
with check (actor_user_id = (select auth.uid()));
create policy audit_log_manage_superadmin
on public.audit_log for all to authenticated
using (private.is_superadmin())
with check (private.is_superadmin());

create policy audit_retention_superadmin
on public.audit_log_retention_settings for all to authenticated
using (private.is_superadmin())
with check (private.is_superadmin());

revoke all on table public.notification_email_settings from authenticated;
grant select (id, created_at, updated_at, provider, gmail_user, from_email, is_active, notes)
on table public.notification_email_settings to authenticated;
create policy notification_email_settings_read_superadmin
on public.notification_email_settings for select to authenticated
using (private.is_superadmin());

create policy notification_preferences_read_active_admin
on public.notification_preferences for select to authenticated
using (private.is_active_admin());
create policy notification_preferences_manage_superadmin
on public.notification_preferences for all to authenticated
using (private.is_superadmin())
with check (private.is_superadmin());

create policy notification_retention_superadmin
on public.notification_log_retention_settings for all to authenticated
using (private.is_superadmin())
with check (private.is_superadmin());

revoke all on table public.notification_delivery_claims from authenticated;

create policy licensure_notification_log_read_authorized
on public.licensure_notification_log for select to authenticated
using (private.has_any_module_access(array['employees', 'expiring_licenses_records'], false));
create policy other_notification_log_read_authorized
on public.other_expiration_notification_log for select to authenticated
using (private.has_module_access('car_insurance_expiration', false));
create policy contract_notification_log_read_authorized
on public.contract_expiration_notification_log for select to authenticated
using (private.has_any_module_access(array['client', 'expiring_contracts'], false));

-- Preserve each bucket's path restrictions but require an authenticated user.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format(
      'alter policy %I on storage.objects to authenticated',
      policy_row.policyname
    );
  end loop;
end
$$;

-- Future public-schema objects inherit authenticated-only API privileges.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public
  grant all privileges on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

notify pgrst, 'reload schema';

commit;
