-- Make role deletion remove dependent permission rows first.

alter table public.role_column_access
  drop constraint if exists role_column_access_role_id_fkey;

alter table public.role_column_access
  add constraint role_column_access_role_id_fkey
  foreign key (role_id) references public.app_roles(role_id) on delete cascade;

alter table public.role_module_access
  drop constraint if exists role_module_access_role_id_fkey;

alter table public.role_module_access
  add constraint role_module_access_role_id_fkey
  foreign key (role_id) references public.app_roles(role_id) on delete cascade;

-- Optional cleanup for any orphaned rows that may already exist.
delete from public.role_column_access
where role_id not in (select role_id from public.app_roles);

delete from public.role_module_access
where role_id not in (select role_id from public.app_roles);