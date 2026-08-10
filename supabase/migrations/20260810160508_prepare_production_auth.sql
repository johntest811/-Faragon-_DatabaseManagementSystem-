-- Stage 1: add Supabase Auth links and private authorization helpers.
-- This stage is intentionally backwards-compatible so existing accounts can
-- be migrated before anonymous database access is removed.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

alter table public.admins
  add column if not exists auth_user_id uuid,
  add column if not exists auth_email text,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_migrated_at timestamptz;

-- New account creation moves to an Edge Function during this transition.
alter table public.admins alter column password drop not null;

create unique index if not exists admins_auth_user_id_uidx
  on public.admins (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists admins_auth_email_uidx
  on public.admins (lower(auth_email))
  where auth_email is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admins_auth_user_id_fkey'
      and conrelid = 'public.admins'::regclass
  ) then
    alter table public.admins
      add constraint admins_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end
$$;

create table if not exists public.admin_auth_rate_limits (
  attempt_key text primary key,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  check (failure_count >= 0)
);

alter table public.admin_auth_rate_limits enable row level security;
revoke all on table public.admin_auth_rate_limits from public, anon, authenticated;
grant all on table public.admin_auth_rate_limits to service_role;

create or replace function private.current_admin_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
  from public.admins a
  where a.auth_user_id = (select auth.uid())
    and coalesce(a.is_active, false) = true
  limit 1;
$$;

create or replace function private.current_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(a.role))
  from public.admins a
  where a.auth_user_id = (select auth.uid())
    and coalesce(a.is_active, false) = true
  limit 1;
$$;

create or replace function private.current_admin_role_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.role_id
  from public.admins a
  join public.app_roles r
    on lower(btrim(r.role_name)) = lower(btrim(a.role))
  where a.auth_user_id = (select auth.uid())
    and coalesce(a.is_active, false) = true
  limit 1;
$$;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_admin_id() is not null;
$$;

create or replace function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_admin_role() = 'superadmin', false);
$$;

create or replace function private.is_security_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.applicant_id is not null
    from public.admins a
    where a.id = private.current_admin_id()
  ), false);
$$;

create or replace function private.has_module_access(
  requested_module_key text,
  require_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_superadmin() then true
    when private.current_admin_id() is null then false
    else coalesce((
      select bool_or(
        case
          when require_write then coalesce(access.can_write, false) or coalesce(access.can_edit, false)
          else coalesce(access.can_read, false)
        end
      )
      from (
        select rma.can_read, rma.can_write, rma.can_edit
        from public.role_module_access rma
        where rma.role_id = private.current_admin_role_id()
          and rma.module_key = lower(btrim(requested_module_key))
        union all
        select ama.can_read, ama.can_write, ama.can_edit
        from public.admin_module_access_overrides ama
        where ama.admin_id = private.current_admin_id()
          and ama.module_key = lower(btrim(requested_module_key))
      ) access
    ), false)
  end;
$$;

create or replace function private.has_any_module_access(
  requested_module_keys text[],
  require_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_or(private.has_module_access(module_key, require_write)), false)
  from unnest(requested_module_keys) as module_key;
$$;

create or replace function public.current_role_name()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_admin_role();
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_superadmin();
$$;

create or replace function public.has_module_access(
  p_module_key text,
  p_write boolean default false
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_module_access(p_module_key, p_write);
$$;

create or replace function public.my_modules()
returns table (module_key text, display_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.module_key, m.display_name
  from public.modules m
  where private.is_superadmin()
     or private.has_module_access(m.module_key, false)
  order by m.module_key;
$$;

-- Keep denormalized admins.role values synchronized when a role is renamed.
create or replace function private.sync_admin_role_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role_name is distinct from new.role_name then
    update public.admins
    set role = lower(btrim(new.role_name))
    where lower(btrim(role)) = lower(btrim(old.role_name));
  end if;
  return new;
end;
$$;

drop trigger if exists app_roles_sync_admin_role_name_trigger on public.app_roles;
create trigger app_roles_sync_admin_role_name_trigger
after update of role_name on public.app_roles
for each row
execute function private.sync_admin_role_name();

revoke all on function public.current_role_name() from public, anon;
revoke all on function public.is_superadmin() from public, anon;
revoke all on function public.has_module_access(text, boolean) from public, anon;
revoke all on function public.my_modules() from public, anon;
grant execute on function public.current_role_name() to authenticated, service_role;
grant execute on function public.is_superadmin() to authenticated, service_role;
grant execute on function public.has_module_access(text, boolean) to authenticated, service_role;
grant execute on function public.my_modules() to authenticated, service_role;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
