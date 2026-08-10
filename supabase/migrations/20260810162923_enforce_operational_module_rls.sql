-- Enforce server-side module access for operational tables.
-- This prevents an authenticated low-privilege account from bypassing the UI
-- and querying another module directly through PostgREST/supabase-js.

begin;

create or replace function private.current_admin_detachment()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(lower(regexp_replace(btrim(coalesce(a.assigned_detachment, '')), '[[:space:]]+', ' ', 'g')), '')
  from public.admins a
  where a.id = private.current_admin_id();
$$;

create or replace function private.can_access_paraphernalia_detachment(target_detachment text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.has_module_access('paraphernalia', false) then false
    when not private.is_security_account() then true
    when private.current_admin_detachment() = 'faragon' then true
    else private.current_admin_detachment() =
      nullif(lower(regexp_replace(btrim(coalesce(target_detachment, '')), '[[:space:]]+', ' ', 'g')), '')
  end;
$$;

revoke all on function private.current_admin_detachment() from public, anon;
revoke all on function private.can_access_paraphernalia_detachment(text) from public, anon;
grant execute on function private.current_admin_detachment() to authenticated, service_role;
grant execute on function private.can_access_paraphernalia_detachment(text) to authenticated, service_role;

-- Standard module-mapped tables.
do $$
declare
  item record;
  policy_row record;
begin
  for item in
    select *
    from (values
      ('applicants', array['dashboard','applicants','employees','reassign','resigned','retired','floating','archive','trash','preview_service_anniversary','expiring_licenses_records']::text[], array['applicants','employees','reassign','resigned','retired','floating','archive','trash']::text[]),
      ('biodata', array['applicants','employees','reassign','resigned','retired','floating','archive','trash']::text[], array['applicants','employees']::text[]),
      ('certificates', array['applicants','employees','reassign','resigned','retired','floating','archive','trash','expiring_licenses_records']::text[], array['applicants','employees']::text[]),
      ('licensure', array['applicants','employees','reassign','resigned','retired','floating','archive','trash','expiring_licenses_records']::text[], array['applicants','employees']::text[]),
      ('employment_record', array['applicants','employees','reassign','resigned','retired','floating','archive','trash']::text[], array['applicants','employees']::text[]),
      ('employment_history', array['applicants','employees','reassign','resigned','retired','floating','archive','trash']::text[], array['applicants','employees']::text[]),
      ('applicant_detachment_history', array['applicants','employees','reassign','resigned','retired','floating','archive','trash']::text[], array['applicants','employees']::text[]),
      ('applicant_other_documents', array['applicants','employees','reassign','resigned','retired','floating','archive','trash']::text[], array['applicants','employees']::text[]),
      ('contracts', array['dashboard','client','expiring_contracts']::text[], array['client']::text[]),
      ('contract_employees', array['client']::text[], array['client']::text[]),
      ('inventory_fixed_asset', array['inventory']::text[], array['inventory']::text[]),
      ('inventory_detachment_history', array['inventory']::text[], array['inventory']::text[]),
      ('inventory_equipment_items', array['inventory']::text[], array['inventory']::text[]),
      ('removed_inventory_equipment_items', array['inventory']::text[], array['inventory']::text[]),
      ('other_expiration_items', array['car_insurance_expiration']::text[], array['car_insurance_expiration']::text[]),
      ('car_insurance_post_distribution_history', array['car_insurance_expiration']::text[], array['car_insurance_expiration']::text[])
    ) as mapped(table_name, read_modules, write_modules)
  loop
    if to_regclass(format('public.%I', item.table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', item.table_name);
    for policy_row in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = item.table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, item.table_name);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_any_module_access(%L::text[], false))',
      item.table_name || '_module_select', item.table_name, item.read_modules::text
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_any_module_access(%L::text[], true))',
      item.table_name || '_module_insert', item.table_name, item.write_modules::text
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_any_module_access(%L::text[], true)) with check (private.has_any_module_access(%L::text[], true))',
      item.table_name || '_module_update', item.table_name, item.write_modules::text, item.write_modules::text
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_any_module_access(%L::text[], true))',
      item.table_name || '_module_delete', item.table_name, item.write_modules::text
    );
  end loop;
end
$$;

-- Paraphernalia rows also enforce each security account's assigned detachment.
do $$
declare
  target_table text;
  policy_row record;
  target_tables text[] := array[
    'paraphernalia',
    'restock',
    'paraphernalia_inventory',
    'paraphernalia_detachment_tables',
    'paraphernalia_items',
    'removed_paraphernalia_items'
  ];
begin
  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is null then continue; end if;
    execute format('alter table public.%I enable row level security', target_table);
    for policy_row in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, target_table);
    end loop;
  end loop;
end
$$;

create policy paraphernalia_select_assigned_detachment
on public.paraphernalia for select to authenticated
using (private.can_access_paraphernalia_detachment(specific_area));
create policy paraphernalia_insert_assigned_detachment
on public.paraphernalia for insert to authenticated
with check (
  private.can_access_paraphernalia_detachment(specific_area)
  and (private.is_security_account() or private.has_module_access('paraphernalia', true))
);
create policy paraphernalia_update_assigned_detachment
on public.paraphernalia for update to authenticated
using (
  private.can_access_paraphernalia_detachment(specific_area)
  and (private.is_security_account() or private.has_module_access('paraphernalia', true))
)
with check (
  private.can_access_paraphernalia_detachment(specific_area)
  and (private.is_security_account() or private.has_module_access('paraphernalia', true))
);
create policy paraphernalia_delete_authorized_admin
on public.paraphernalia for delete to authenticated
using (not private.is_security_account() and private.has_module_access('paraphernalia', true));

create policy restock_select_assigned_detachment
on public.restock for select to authenticated
using (private.can_access_paraphernalia_detachment(detachment));
create policy restock_manage_authorized_admin
on public.restock for all to authenticated
using (not private.is_security_account() and private.has_module_access('paraphernalia', true))
with check (not private.is_security_account() and private.has_module_access('paraphernalia', true));

create policy paraphernalia_inventory_select_assigned_detachment
on public.paraphernalia_inventory for select to authenticated
using (private.can_access_paraphernalia_detachment(specific_area));
create policy paraphernalia_inventory_manage_authorized_admin
on public.paraphernalia_inventory for all to authenticated
using (not private.is_security_account() and private.has_module_access('paraphernalia', true))
with check (not private.is_security_account() and private.has_module_access('paraphernalia', true));

create policy paraphernalia_detachment_tables_select_assigned
on public.paraphernalia_detachment_tables for select to authenticated
using (private.can_access_paraphernalia_detachment(detachment));
create policy paraphernalia_detachment_tables_manage_authorized_admin
on public.paraphernalia_detachment_tables for all to authenticated
using (not private.is_security_account() and private.has_module_access('paraphernalia', true))
with check (not private.is_security_account() and private.has_module_access('paraphernalia', true));

create policy paraphernalia_items_read_module
on public.paraphernalia_items for select to authenticated
using (private.has_module_access('paraphernalia', false));
create policy paraphernalia_items_manage_authorized_admin
on public.paraphernalia_items for all to authenticated
using (not private.is_security_account() and private.has_module_access('paraphernalia', true))
with check (not private.is_security_account() and private.has_module_access('paraphernalia', true));

create policy removed_paraphernalia_items_read_authorized_admin
on public.removed_paraphernalia_items for select to authenticated
using (not private.is_security_account() and private.has_module_access('paraphernalia', false));
create policy removed_paraphernalia_items_manage_authorized_admin
on public.removed_paraphernalia_items for all to authenticated
using (not private.is_security_account() and private.has_module_access('paraphernalia', true))
with check (not private.is_security_account() and private.has_module_access('paraphernalia', true));

-- Notification recipient lists follow their owning module.
do $$
declare
  target_table text;
  policy_row record;
  target_tables text[] := array[
    'notification_recipients',
    'car_insurance_notification_recipients',
    'contract_notification_recipients'
  ];
begin
  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is null then continue; end if;
    execute format('alter table public.%I enable row level security', target_table);
    for policy_row in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, target_table);
    end loop;
  end loop;
end
$$;

create policy notification_recipients_read_authorized
on public.notification_recipients for select to authenticated
using (private.has_any_module_access(array['settings','expiring_licenses_records'], false));
create policy notification_recipients_manage_settings
on public.notification_recipients for all to authenticated
using (private.has_module_access('settings', true))
with check (private.has_module_access('settings', true));

create policy car_recipients_read_authorized
on public.car_insurance_notification_recipients for select to authenticated
using (private.has_module_access('car_insurance_expiration', false));
create policy car_recipients_manage_authorized
on public.car_insurance_notification_recipients for all to authenticated
using (private.has_module_access('car_insurance_expiration', true))
with check (private.has_module_access('car_insurance_expiration', true));

create policy contract_recipients_read_authorized
on public.contract_notification_recipients for select to authenticated
using (private.has_any_module_access(array['client','expiring_contracts'], false));
create policy contract_recipients_manage_authorized
on public.contract_notification_recipients for all to authenticated
using (private.has_module_access('client', true))
with check (private.has_module_access('client', true));

-- Requests are private to their requester unless opened by Superadmin or the
-- Reviewer Queue. Only reviewers resolve requests; requesters may remove their own.
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'access_requests'
  loop
    execute format('drop policy if exists %I on public.access_requests', policy_row.policyname);
  end loop;
end
$$;

create policy access_requests_select_own_or_reviewer
on public.access_requests for select to authenticated
using (
  requester_admin_id = private.current_admin_id()
  or requester_user_id = (select auth.uid())
  or private.is_superadmin()
  or private.has_module_access('access_reviewer_queue', false)
);
create policy access_requests_insert_own
on public.access_requests for insert to authenticated
with check (
  requester_admin_id = private.current_admin_id()
  or requester_user_id = (select auth.uid())
);
create policy access_requests_update_reviewer
on public.access_requests for update to authenticated
using (private.is_superadmin() or private.has_module_access('access_reviewer_queue', true))
with check (private.is_superadmin() or private.has_module_access('access_reviewer_queue', true));
create policy access_requests_delete_own_or_reviewer
on public.access_requests for delete to authenticated
using (
  requester_admin_id = private.current_admin_id()
  or requester_user_id = (select auth.uid())
  or private.is_superadmin()
  or private.has_module_access('access_reviewer_queue', true)
);

notify pgrst, 'reload schema';

commit;
