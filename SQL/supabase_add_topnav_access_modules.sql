-- Add RBAC module entries for top navigation widgets.
-- Car Insurance Expiration already uses the existing `car_insurance_expiration` module.
-- Run this in Supabase SQL Editor.

begin;

insert into public.modules (module_key, display_name, path)
values
  ('preview_service_anniversary', 'Preview (1+ year of service)', '/Main_Modules/Employees/'),
  ('expiring_licenses_records', 'Expiring Licenses and Records', '/Main_Modules/Employees/')
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
  on m.module_key in ('preview_service_anniversary', 'expiring_licenses_records')
where lower(btrim(r.role_name)) = 'superadmin'
on conflict (role_id, module_key) do update
set can_read = excluded.can_read,
    can_write = excluded.can_write,
    can_edit = excluded.can_edit;

commit;
