-- Add the reviewer queue as a first-class module so it can be requested and permissioned.
-- Safe to run multiple times.

begin;

insert into public.modules (module_key, display_name, path)
values
  ('access_reviewer_queue', 'Reviewer Queue', '/Main_Modules/Requests/Queue/')
on conflict (module_key) do update
set display_name = excluded.display_name,
    path = excluded.path;

with superadmin_role as (
  select role_id
  from public.app_roles
  where role_name = 'superadmin'
  limit 1
)
insert into public.role_module_access (role_id, module_key, can_read, can_write, can_edit)
select role_id, 'access_reviewer_queue', true, true, true
from superadmin_role
on conflict (role_id, module_key) do update
set can_read = true,
    can_write = true,
    can_edit = true;

commit;
