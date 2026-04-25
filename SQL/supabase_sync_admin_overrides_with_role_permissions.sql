-- Sync legacy admin overrides with role permissions.
-- Run this in the Supabase SQL editor.
-- Safe to rerun.

begin;

create or replace function public.trg_cleanup_admin_overrides_on_role_module_revocation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if not (coalesce(old.can_read, true) = true and coalesce(new.can_read, true) = false) then
      return new;
    end if;
  elsif tg_op = 'DELETE' then
    if coalesce(old.can_read, true) <> true then
      return old;
    end if;
  else
    return coalesce(new, old);
  end if;

  delete from public.admin_module_access_overrides amo
  using public.admins a
  where a.id = amo.admin_id
    and lower(btrim(a.role)) = (
      select lower(btrim(role_name))
      from public.app_roles
      where role_id = old.role_id
    )
    and amo.module_key = old.module_key
    and not exists (
      select 1
      from public.role_module_access rma
      where rma.role_id = old.role_id
        and rma.module_key = amo.module_key
        and rma.can_read = true
    );

  delete from public.admin_column_access_overrides aco
  using public.admins a
  where a.id = aco.admin_id
    and lower(btrim(a.role)) = (
      select lower(btrim(role_name))
      from public.app_roles
      where role_id = old.role_id
    )
    and aco.module_key = old.module_key
    and not exists (
      select 1
      from public.role_module_access rma
      where rma.role_id = old.role_id
        and rma.module_key = aco.module_key
        and rma.can_read = true
    );

  return coalesce(new, old);
end;
$$;

create or replace function public.trg_cleanup_admin_overrides_on_role_column_revocation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if not (coalesce(old.can_read, true) = true and coalesce(new.can_read, true) = false) then
      return new;
    end if;
  elsif tg_op = 'DELETE' then
    if coalesce(old.can_read, true) <> true then
      return old;
    end if;
  else
    return coalesce(new, old);
  end if;

  delete from public.admin_column_access_overrides aco
  using public.admins a
  where a.id = aco.admin_id
    and lower(btrim(a.role)) = (
      select lower(btrim(role_name))
      from public.app_roles
      where role_id = old.role_id
    )
    and aco.module_key = old.module_key
    and aco.column_key = old.column_key
    and not exists (
      select 1
      from public.role_column_access rca
      where rca.role_id = old.role_id
        and rca.module_key = aco.module_key
        and rca.column_key = aco.column_key
        and rca.can_read = true
    );

  return coalesce(new, old);
end;
$$;

-- Attach triggers.
drop trigger if exists trg_cleanup_admin_overrides_on_role_module_revocation on public.role_module_access;
create trigger trg_cleanup_admin_overrides_on_role_module_revocation
after delete or update of can_read on public.role_module_access
for each row
execute function public.trg_cleanup_admin_overrides_on_role_module_revocation();

drop trigger if exists trg_cleanup_admin_overrides_on_role_column_revocation on public.role_column_access;
create trigger trg_cleanup_admin_overrides_on_role_column_revocation
after delete or update of can_read on public.role_column_access
for each row
execute function public.trg_cleanup_admin_overrides_on_role_column_revocation();

-- One-time cleanup for stale legacy admin overrides already out of sync with role permissions.
delete from public.admin_column_access_overrides aco
using public.admins a
where a.id = aco.admin_id
  and not exists (
    select 1
    from public.app_roles ar
    join public.role_module_access rma
      on rma.role_id = ar.role_id
    where lower(btrim(ar.role_name)) = lower(btrim(a.role))
      and rma.module_key = aco.module_key
      and rma.can_read = true
  );

delete from public.admin_module_access_overrides amo
using public.admins a
where a.id = amo.admin_id
  and not exists (
    select 1
    from public.app_roles ar
    join public.role_module_access rma
      on rma.role_id = ar.role_id
    where lower(btrim(ar.role_name)) = lower(btrim(a.role))
      and rma.module_key = amo.module_key
      and rma.can_read = true
  );

commit;
