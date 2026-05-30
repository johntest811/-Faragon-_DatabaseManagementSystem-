-- Remove the legacy Reports module and any RBAC/request rows that still reference it.
-- Safe to run multiple times.

begin;

do $$
begin
  if to_regclass('public.access_requests') is not null then
    delete from public.access_requests
    where requested_module_key = 'reports'
       or requested_path = '/Main_Modules/Reports/';
  end if;
end $$;

do $$
begin
  if to_regclass('public.admin_column_access_overrides') is not null then
    delete from public.admin_column_access_overrides
    where module_key = 'reports'
       or (module_key = 'logistics' and column_key = 'reports');
  end if;
end $$;

do $$
begin
  if to_regclass('public.admin_module_access_overrides') is not null then
    delete from public.admin_module_access_overrides
    where module_key = 'reports';
  end if;
end $$;

do $$
begin
  if to_regclass('public.role_column_access') is not null then
    delete from public.role_column_access
    where module_key = 'reports'
       or (module_key = 'logistics' and column_key = 'reports');
  end if;
end $$;

do $$
begin
  if to_regclass('public.role_module_access') is not null then
    delete from public.role_module_access
    where module_key = 'reports';
  end if;
end $$;

do $$
begin
  if to_regclass('public.modules') is not null then
    delete from public.modules
    where module_key = 'reports';
  end if;
end $$;

commit;
