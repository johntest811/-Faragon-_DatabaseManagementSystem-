-- Add RBAC module entries for top navigation widgets.
-- Car Insurance Expiration uses the existing `car_insurance_expiration` module,
-- but this script also makes sure the module row exists.
-- Run this in Supabase SQL Editor.

begin;

insert into public.modules (module_key, display_name, path)
values
  ('recent_activities', 'Recent Activities', '/Main_Modules/Audit/'),
  ('car_insurance_expiration', 'Car Insurance Expiration', '/Main_Modules/Logistics/CarInsuranceExpiration/'),
  ('preview_service_anniversary', 'Preview (1+ year of service)', '/Main_Modules/Employees/'),
  ('expiring_licenses_records', 'Expiring Licenses and Records', '/Main_Modules/Employees/'),
  ('expiring_contracts', 'Expiring Contracts', '/Main_Modules/Client/')
on conflict (module_key) do update
set display_name = excluded.display_name,
    path = excluded.path;

insert into public.role_module_access (role_id, module_key, can_read, can_write, can_edit)
select
  r.role_id,
  m.module_key,
  true,
  false,
  false
from public.app_roles r
join public.modules m
  on m.module_key in (
    'recent_activities',
    'car_insurance_expiration',
    'preview_service_anniversary',
    'expiring_licenses_records',
    'expiring_contracts'
  )
where lower(btrim(r.role_name)) = 'superadmin'
on conflict (role_id, module_key) do update
set can_read = excluded.can_read,
    can_write = excluded.can_write,
    can_edit = excluded.can_edit;

commit;
