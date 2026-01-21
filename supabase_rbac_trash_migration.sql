-- Run this in Supabase SQL Editor (safe to re-run; uses IF NOT EXISTS where possible)
-- Goal:
-- 1) Supabase Auth-based RBAC with Superadmin-only role/module management
-- 2) Trash flow for accounts + employees (soft delete -> restore -> permanent delete)
-- 3) Helpers (RPC/functions) the app calls for role/module gating

begin;

-- Extensions
create extension if not exists "pgcrypto";

-- -----------------------------
-- Roles + Modules
-- -----------------------------
create table if not exists public.app_roles (
  role_id uuid primary key default gen_random_uuid(),
  role_name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.modules (
  module_key text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_module_access (
  role_id uuid not null references public.app_roles(role_id) on delete cascade,
  module_key text not null references public.modules(module_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, module_key)
);

-- One role per user (simple + matches your UI)
create table if not exists public.user_role_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references public.app_roles(role_id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Public directory (so the app can list accounts without access to auth.users)
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text null,
  kind text not null check (kind in ('admin','employee')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Optional: link an employee auth account to an applicant record
create table if not exists public.employee_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  applicant_id uuid unique null references public.applicants(applicant_id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------
-- Trash
-- -----------------------------
create table if not exists public.account_trash (
  trash_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('admin','employee')),
  deleted_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz not null default now(),
  reason text null,
  snapshot jsonb null
);

-- Applicants trash flags (employees table)
alter table public.applicants
  add column if not exists is_trashed boolean not null default false,
  add column if not exists trashed_at timestamptz null,
  add column if not exists trashed_by uuid null;

-- -----------------------------
-- Seed modules
-- -----------------------------
insert into public.modules(module_key, display_name)
values
  ('dashboard','Dashboard'),
  ('employees','Employees'),
  ('archive','Archive'),
  ('roles','Roles'),
  ('settings','Settings'),
  ('trash','Trash')
on conflict (module_key) do update set display_name = excluded.display_name;

-- Seed base roles
insert into public.app_roles(role_name)
values ('superadmin'), ('admin'), ('employee')
on conflict (role_name) do nothing;

-- Give superadmin access to everything
insert into public.role_module_access(role_id, module_key)
select r.role_id, m.module_key
from public.app_roles r
cross join public.modules m
where r.role_name = 'superadmin'
on conflict do nothing;

-- Default admin access (tweak as needed)
insert into public.role_module_access(role_id, module_key)
select r.role_id, m.module_key
from public.app_roles r
join public.modules m on m.module_key in ('dashboard','employees','archive','roles','settings','trash')
where r.role_name = 'admin'
on conflict do nothing;

-- Default employee access (read-only screens)
insert into public.role_module_access(role_id, module_key)
select r.role_id, m.module_key
from public.app_roles r
join public.modules m on m.module_key in ('dashboard','employees','archive')
where r.role_name = 'employee'
on conflict do nothing;

-- -----------------------------
-- Helper functions (RPC)
-- -----------------------------
create or replace function public.current_role_name()
returns text
language sql
stable
as $$
  select r.role_name
  from public.user_role_memberships urm
  join public.app_roles r on r.role_id = urm.role_id
  where urm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
as $$
  select coalesce((public.current_role_name() = 'superadmin'), false);
$$;

create or replace function public.has_module_access(p_module_key text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_role_memberships urm
    join public.role_module_access rma on rma.role_id = urm.role_id
    where urm.user_id = auth.uid()
      and rma.module_key = p_module_key
  );
$$;

create or replace function public.my_modules()
returns table(module_key text, display_name text)
language sql
stable
as $$
  select m.module_key, m.display_name
  from public.modules m
  where public.has_module_access(m.module_key)
  order by m.module_key;
$$;

create or replace function public.is_trashed_account(p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists(select 1 from public.account_trash t where t.user_id = p_user_id);
$$;

-- -----------------------------
-- RLS
-- -----------------------------
alter table public.app_roles enable row level security;
alter table public.modules enable row level security;
alter table public.role_module_access enable row level security;
alter table public.user_role_memberships enable row level security;
alter table public.user_profiles enable row level security;
alter table public.employee_profiles enable row level security;
alter table public.account_trash enable row level security;

-- Applicants + dependent tables should also be protected. Enable if not already.
alter table public.applicants enable row level security;

-- Read modules/roles only if authenticated
drop policy if exists "modules_read_auth" on public.modules;
create policy "modules_read_auth" on public.modules
for select to authenticated
using (true);

drop policy if exists "app_roles_read_auth" on public.app_roles;
create policy "app_roles_read_auth" on public.app_roles
for select to authenticated
using (true);

-- Superadmin manages roles/modules mappings
drop policy if exists "role_module_superadmin_all" on public.role_module_access;
create policy "role_module_superadmin_all" on public.role_module_access
for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "app_roles_superadmin_all" on public.app_roles;
create policy "app_roles_superadmin_all" on public.app_roles
for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

-- Users can read their own membership; superadmin can read all
drop policy if exists "urm_read_self_or_super" on public.user_role_memberships;
create policy "urm_read_self_or_super" on public.user_role_memberships
for select to authenticated
using (user_id = auth.uid() or public.is_superadmin());

drop policy if exists "urm_superadmin_write" on public.user_role_memberships;
create policy "urm_superadmin_write" on public.user_role_memberships
for insert, update, delete to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

-- User profiles: users read own; superadmin reads all; superadmin writes all
drop policy if exists "user_profiles_read_self_or_super" on public.user_profiles;
create policy "user_profiles_read_self_or_super" on public.user_profiles
for select to authenticated
using (user_id = auth.uid() or public.is_superadmin());

drop policy if exists "user_profiles_superadmin_write" on public.user_profiles;
create policy "user_profiles_superadmin_write" on public.user_profiles
for insert, update, delete to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

-- Employee profiles: user reads own; superadmin reads all; superadmin writes all
drop policy if exists "employee_profiles_read_self_or_super" on public.employee_profiles;
create policy "employee_profiles_read_self_or_super" on public.employee_profiles
for select to authenticated
using (user_id = auth.uid() or public.is_superadmin());

drop policy if exists "employee_profiles_superadmin_write" on public.employee_profiles;
create policy "employee_profiles_superadmin_write" on public.employee_profiles
for insert, update, delete to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

-- Account trash: superadmin only
drop policy if exists "account_trash_superadmin_all" on public.account_trash;
create policy "account_trash_superadmin_all" on public.account_trash
for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

-- Applicants: read requires module access and not trashed (unless superadmin / trash module)
-- NOTE: this assumes everyone is authenticated.
drop policy if exists "applicants_read_employees_module" on public.applicants;
create policy "applicants_read_employees_module" on public.applicants
for select to authenticated
using (
  (not is_trashed and public.has_module_access('employees'))
  or (is_trashed and public.has_module_access('trash'))
  or public.is_superadmin()
);

-- Applicants write: admin/superadmin with module access
create or replace function public.can_write_employees()
returns boolean
language sql
stable
as $$
  select (public.current_role_name() in ('admin','superadmin')) and public.has_module_access('employees');
$$;

drop policy if exists "applicants_write_employees" on public.applicants;
create policy "applicants_write_employees" on public.applicants
for insert, update to authenticated
using (public.can_write_employees())
with check (public.can_write_employees());

-- Applicants delete: superadmin only (use trash flow in app)
drop policy if exists "applicants_delete_superadmin" on public.applicants;
create policy "applicants_delete_superadmin" on public.applicants
for delete to authenticated
using (public.is_superadmin());

commit;
