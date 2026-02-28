-- Add Access Requests + ensure every module/page is permission-gated.
-- Paste into Supabase SQL editor.

-- 0) Extensions (gen_random_uuid)
create extension if not exists pgcrypto;

-- 1) Modules (one key per page/route)
insert into public.modules (module_key, display_name, path)
values
  ('dashboard', 'Dashboard', '/Main_Modules/Dashboard/'),
  ('employees', 'Employees', '/Main_Modules/Employees/'),
  ('reassign', 'Reassigned', '/Main_Modules/Reassign/'),
  ('resigned', 'Resigned', '/Main_Modules/Resigned/'),
  ('retired', 'Retired', '/Main_Modules/Retired/'),
  ('archive', 'Archive', '/Main_Modules/Archive/'),
  ('trash', 'Trash', '/Main_Modules/Trash/'),
  ('audit', 'Audit', '/Main_Modules/Audit/'),
  ('settings', 'Settings', '/Main_Modules/Settings/'),

  -- Logistics child pages
  ('client', 'Client', '/Main_Modules/Client/'),
  ('inventory', 'Inventory', '/Main_Modules/Inventory/'),
  ('paraphernalia', 'Paraphernalia', '/Main_Modules/Paraphernalia/'),
  ('reports', 'Reports', '/Main_Modules/Reports/'),

  -- Request-access page (keep reachable so users can ask for permissions)
  ('requests', 'Requests', '/Main_Modules/Requests/'),

  -- Access-management (Admin Accounts / Roles / Permissions)
  ('access', 'Admin Accounts', '/Main_Modules/AdminAccounts/'),

  -- Optional group route (layout treats this as a group)
  ('logistics', 'Logistics', '/Main_Modules/Logistics/')
on conflict (module_key) do update
set display_name = excluded.display_name,
    path = excluded.path;

-- 2) Access Requests table
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),

  requested_module_key text not null,
  requested_path text,
  reason text,

  -- Supabase Auth identity (if using auth)
  requester_user_id uuid,
  requester_email text,

  -- Legacy localStorage adminSession identity (if using public.admins login)
  requester_admin_id uuid,
  requester_username text,
  requester_role text,

  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,

  constraint access_requests_module_fkey
    foreign key (requested_module_key) references public.modules(module_key),
  constraint access_requests_requester_admin_fkey
    foreign key (requester_admin_id) references public.admins(id)
);

create index if not exists access_requests_created_at_idx on public.access_requests (created_at desc);
create index if not exists access_requests_requested_module_idx on public.access_requests (requested_module_key);
create index if not exists access_requests_requester_user_idx on public.access_requests (requester_user_id);
create index if not exists access_requests_requester_admin_idx on public.access_requests (requester_admin_id);

-- NOTE: This script does NOT enable RLS, because your app supports a legacy login
-- mode that may rely on anon access. If you want RLS enabled, say so and I’ll
-- tailor policies to your exact auth model.

-- 3) Default role-module access rows
-- Superadmin gets read/write to everything.
insert into public.role_module_access (role_id, module_key, can_read, can_write)
select r.role_id, m.module_key, true, true
from public.app_roles r
join public.modules m on true
where r.role_name = 'superadmin'
on conflict (role_id, module_key) do update
set can_read = excluded.can_read,
    can_write = excluded.can_write;

-- Admin defaults (edit to your preference).
insert into public.role_module_access (role_id, module_key, can_read, can_write)
select r.role_id, m.module_key, true, true
from public.app_roles r
join public.modules m
  on m.module_key in (
    'dashboard','employees','reassign','resigned','retired','archive',
    'client','inventory','paraphernalia','reports',
    'trash','audit','settings','requests','logistics'
  )
where r.role_name = 'admin'
on conflict (role_id, module_key) do update
set can_read = excluded.can_read,
    can_write = excluded.can_write;

-- Employee defaults (edit to your preference).
insert into public.role_module_access (role_id, module_key, can_read, can_write)
select r.role_id, m.module_key, true, false
from public.app_roles r
join public.modules m
  on m.module_key in ('dashboard','employees','archive','requests')
where r.role_name = 'employee'
on conflict (role_id, module_key) do update
set can_read = excluded.can_read,
    can_write = excluded.can_write;

-- 4) RPCs used by the Next/Electron app
-- current_role_name(): returns the user's role name based on admin_role_memberships.
create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ar.role_name
  from public.admin_role_memberships m
  join public.app_roles ar on ar.role_id = m.role_id
  where m.user_id = auth.uid()
  order by case ar.role_name
    when 'superadmin' then 1
    when 'admin' then 2
    when 'employee' then 3
    else 99
  end
  limit 1;
$$;

-- my_modules(): returns allowed modules for the current user.
create or replace function public.my_modules()
returns table (module_key text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.module_key, m.display_name
  from public.admin_role_memberships rm
  join public.role_module_access a on a.role_id = rm.role_id
  join public.modules m on m.module_key = a.module_key
  where rm.user_id = auth.uid()
    and a.can_read = true
  order by m.module_key;
$$;
