-- Fix AdminAccounts <-> Roles/Permissions <-> Requests <-> Reviewer Queue integration.
-- Safe to run multiple times.

begin;

create extension if not exists pgcrypto;

-- Core RBAC tables
create table if not exists public.app_roles (
  role_id uuid primary key default gen_random_uuid(),
  role_name text not null unique
);

create table if not exists public.modules (
  module_key text primary key,
  display_name text not null,
  path text not null
);

insert into public.modules (module_key, display_name, path)
values
  ('dashboard', 'Dashboard', '/Main_Modules/Dashboard/'),
  ('employees', 'Employees', '/Main_Modules/Employees/'),
  ('reassign', 'Reassigned', '/Main_Modules/Reassign/'),
  ('resigned', 'Resigned', '/Main_Modules/Resigned/'),
  ('retired', 'Retired', '/Main_Modules/Retired/'),
  ('archive', 'Archive', '/Main_Modules/Archive/'),
  ('client', 'Client', '/Main_Modules/Client/'),
  ('inventory', 'Inventory', '/Main_Modules/Inventory/'),
  ('paraphernalia', 'Paraphernalia', '/Main_Modules/Paraphernalia/'),
  ('reports', 'Reports', '/Main_Modules/Reports/'),
  ('requests', 'Requests', '/Main_Modules/Requests/'),
  ('audit', 'Audit', '/Main_Modules/Audit/'),
  ('settings', 'Settings', '/Main_Modules/Settings/'),
  ('access', 'Admin Accounts', '/Main_Modules/AdminAccounts/'),
  ('logistics', 'Logistics', '/Main_Modules/Logistics/')
on conflict (module_key) do update
set display_name = excluded.display_name,
    path = excluded.path;

create table if not exists public.role_module_access (
  role_id uuid not null,
  module_key text not null,
  can_read boolean not null default true,
  can_write boolean not null default false,
  constraint role_module_access_pkey primary key (role_id, module_key),
  constraint role_module_access_role_id_fkey
    foreign key (role_id) references public.app_roles(role_id) on delete cascade,
  constraint role_module_access_module_key_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

alter table public.role_module_access
  add column if not exists can_read boolean;
alter table public.role_module_access
  add column if not exists can_write boolean;

update public.role_module_access set can_read = true where can_read is null;
update public.role_module_access set can_write = false where can_write is null;

alter table public.role_module_access alter column can_read set default true;
alter table public.role_module_access alter column can_write set default false;

create table if not exists public.role_column_access (
  role_id uuid not null,
  module_key text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid,
  constraint role_column_access_pkey primary key (role_id, module_key, column_key),
  constraint role_column_access_role_id_fkey
    foreign key (role_id) references public.app_roles(role_id),
  constraint role_column_access_module_key_fkey
    foreign key (module_key) references public.modules(module_key)
);

create index if not exists role_module_access_role_idx
  on public.role_module_access (role_id);
create index if not exists role_module_access_module_idx
  on public.role_module_access (module_key);
create index if not exists role_column_access_role_module_idx
  on public.role_column_access (role_id, module_key);
create index if not exists role_column_access_module_idx
  on public.role_column_access (module_key);

-- Remove broken one-column FK links to role_module_access and enforce composite FK.
do $$
declare
  bad_fk record;
begin
  if to_regclass('public.role_column_access') is null or to_regclass('public.role_module_access') is null then
    return;
  end if;

  for bad_fk in
    select conname
    from pg_constraint
    where conrelid = 'public.role_column_access'::regclass
      and contype = 'f'
      and confrelid = 'public.role_module_access'::regclass
  loop
    execute format('alter table public.role_column_access drop constraint if exists %I', bad_fk.conname);
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'role_column_access_role_module_fkey'
      and conrelid = 'public.role_column_access'::regclass
  ) then
    alter table public.role_column_access
      add constraint role_column_access_role_module_fkey
      foreign key (role_id, module_key)
      references public.role_module_access(role_id, module_key)
      on delete cascade;
  end if;
end
$$;

-- Keep parent module permission in sync whenever a role-column permission is granted.
create or replace function public.trg_ensure_role_module_access_for_column_access()
returns trigger
language plpgsql
as $$
begin
  insert into public.role_module_access (role_id, module_key, can_read, can_write)
  values (new.role_id, new.module_key, true, false)
  on conflict (role_id, module_key) do update
    set can_read = true;
  return new;
end;
$$;

drop trigger if exists trg_role_column_access_ensure_parent on public.role_column_access;
create trigger trg_role_column_access_ensure_parent
before insert or update of role_id, module_key on public.role_column_access
for each row execute function public.trg_ensure_role_module_access_for_column_access();

-- Individual overrides used by Admin Accounts / Permissions / Queue approvals
create table if not exists public.admin_module_access_overrides (
  admin_id uuid not null,
  module_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (admin_id, module_key),
  constraint admin_module_access_overrides_admin_fkey
    foreign key (admin_id) references public.admins(id) on delete cascade,
  constraint admin_module_access_overrides_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

create table if not exists public.admin_column_access_overrides (
  admin_id uuid not null,
  module_key text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (admin_id, module_key, column_key),
  constraint admin_column_access_overrides_admin_fkey
    foreign key (admin_id) references public.admins(id) on delete cascade,
  constraint admin_column_access_overrides_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

create table if not exists public.user_module_access_overrides (
  user_id uuid not null,
  module_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, module_key),
  constraint user_module_access_overrides_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

create table if not exists public.user_column_access_overrides (
  user_id uuid not null,
  module_key text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, module_key, column_key),
  constraint user_column_access_overrides_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

create table if not exists public.admin_applicant_access_overrides (
  admin_id uuid not null,
  module_key text not null,
  applicant_id uuid not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (admin_id, module_key, applicant_id),
  constraint admin_applicant_access_admin_fkey
    foreign key (admin_id) references public.admins(id) on delete cascade,
  constraint admin_applicant_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade,
  constraint admin_applicant_access_applicant_fkey
    foreign key (applicant_id) references public.applicants(applicant_id) on delete cascade
);

create table if not exists public.user_applicant_access_overrides (
  user_id uuid not null,
  module_key text not null,
  applicant_id uuid not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, module_key, applicant_id),
  constraint user_applicant_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade,
  constraint user_applicant_access_applicant_fkey
    foreign key (applicant_id) references public.applicants(applicant_id) on delete cascade
);

create table if not exists public.admin_applicant_column_access_overrides (
  admin_id uuid not null,
  module_key text not null,
  applicant_id uuid not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (admin_id, module_key, applicant_id, column_key),
  constraint admin_applicant_col_access_admin_fkey
    foreign key (admin_id) references public.admins(id) on delete cascade,
  constraint admin_applicant_col_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade,
  constraint admin_applicant_col_access_applicant_fkey
    foreign key (applicant_id) references public.applicants(applicant_id) on delete cascade
);

create table if not exists public.user_applicant_column_access_overrides (
  user_id uuid not null,
  module_key text not null,
  applicant_id uuid not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, module_key, applicant_id, column_key),
  constraint user_applicant_col_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade,
  constraint user_applicant_col_access_applicant_fkey
    foreign key (applicant_id) references public.applicants(applicant_id) on delete cascade
);

create table if not exists public.admin_row_identifier_column_access_overrides (
  admin_id uuid not null,
  module_key text not null,
  row_identifier_key text not null,
  row_identifier_value text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (admin_id, module_key, row_identifier_key, row_identifier_value, column_key),
  constraint admin_row_identifier_col_access_admin_fkey
    foreign key (admin_id) references public.admins(id) on delete cascade,
  constraint admin_row_identifier_col_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

create table if not exists public.user_row_identifier_column_access_overrides (
  user_id uuid not null,
  module_key text not null,
  row_identifier_key text not null,
  row_identifier_value text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, module_key, row_identifier_key, row_identifier_value, column_key),
  constraint user_row_identifier_col_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

create index if not exists admin_column_access_module_idx
  on public.admin_column_access_overrides (module_key);
create index if not exists user_column_access_module_idx
  on public.user_column_access_overrides (module_key);
create index if not exists admin_applicant_access_lookup_idx
  on public.admin_applicant_access_overrides (admin_id, module_key, applicant_id);
create index if not exists user_applicant_access_lookup_idx
  on public.user_applicant_access_overrides (user_id, module_key, applicant_id);
create index if not exists admin_applicant_col_access_lookup_idx
  on public.admin_applicant_column_access_overrides (admin_id, module_key, applicant_id);
create index if not exists user_applicant_col_access_lookup_idx
  on public.user_applicant_column_access_overrides (user_id, module_key, applicant_id);
create index if not exists admin_row_identifier_col_access_lookup_idx
  on public.admin_row_identifier_column_access_overrides (admin_id, module_key, row_identifier_key, row_identifier_value);
create index if not exists user_row_identifier_col_access_lookup_idx
  on public.user_row_identifier_column_access_overrides (user_id, module_key, row_identifier_key, row_identifier_value);

-- Request table fields used by Requests + Reviewer Queue pages
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'PENDING',
  requested_module_key text not null,
  requested_path text,
  reason text,
  requester_user_id uuid,
  requester_email text,
  requester_admin_id uuid,
  requester_username text,
  requester_role text,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  requested_column_key text,
  requested_column_keys text[],
  requested_applicant_id uuid,
  requested_applicant_ids text[],
  requested_row_identifier_key text,
  requested_row_identifier_value text,
  requested_row_identifier_values text[],
  request_scope_row boolean not null default false,
  request_scope_column boolean not null default false,
  approver_admin_id uuid,
  approver_username text,
  approver_full_name text,
  constraint access_requests_module_fkey
    foreign key (requested_module_key) references public.modules(module_key)
);

alter table public.access_requests add column if not exists requested_column_key text;
alter table public.access_requests add column if not exists requested_column_keys text[];
alter table public.access_requests add column if not exists requested_applicant_id uuid;
alter table public.access_requests add column if not exists requested_applicant_ids text[];
alter table public.access_requests add column if not exists requested_row_identifier_key text;
alter table public.access_requests add column if not exists requested_row_identifier_value text;
alter table public.access_requests add column if not exists requested_row_identifier_values text[];
alter table public.access_requests add column if not exists request_scope_row boolean;
alter table public.access_requests add column if not exists request_scope_column boolean;
alter table public.access_requests add column if not exists requester_user_id uuid;
alter table public.access_requests add column if not exists requester_email text;
alter table public.access_requests add column if not exists requester_admin_id uuid;
alter table public.access_requests add column if not exists requester_username text;
alter table public.access_requests add column if not exists requester_role text;
alter table public.access_requests add column if not exists approver_admin_id uuid;
alter table public.access_requests add column if not exists approver_username text;
alter table public.access_requests add column if not exists approver_full_name text;

update public.access_requests
set request_scope_row = false
where request_scope_row is null;

update public.access_requests
set request_scope_column = false
where request_scope_column is null;

alter table public.access_requests alter column request_scope_row set default false;
alter table public.access_requests alter column request_scope_column set default false;

update public.access_requests
set status = 'PENDING'
where status is null or btrim(status) = '';

update public.access_requests
set status = upper(btrim(status))
where status is not null and status <> upper(btrim(status));

update public.access_requests
set status = 'PENDING'
where status not in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

alter table public.access_requests alter column status set default 'PENDING';
alter table public.access_requests alter column status set not null;
alter table public.access_requests drop constraint if exists access_requests_status_check;
alter table public.access_requests
  add constraint access_requests_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

update public.access_requests
set requested_column_keys = array[requested_column_key]
where requested_column_key is not null
  and requested_column_keys is null;

update public.access_requests
set requested_row_identifier_values = array[requested_row_identifier_value]
where requested_row_identifier_value is not null
  and requested_row_identifier_values is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'access_requests'
      and column_name = 'requested_applicant_ids'
      and udt_name = '_text'
  ) then
    execute $sql$
      update public.access_requests
      set requested_applicant_ids = array[requested_applicant_id::text]
      where requested_applicant_id is not null
        and requested_applicant_ids is null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'access_requests'
      and column_name = 'requested_applicant_ids'
      and udt_name = '_uuid'
  ) then
    execute $sql$
      update public.access_requests
      set requested_applicant_ids = array[requested_applicant_id]
      where requested_applicant_id is not null
        and requested_applicant_ids is null
    $sql$;
  end if;
end
$$;

update public.access_requests ar
set approver_username = a.username,
    approver_full_name = coalesce(ar.approver_full_name, a.full_name)
from public.admins a
where ar.approver_admin_id = a.id
  and (ar.approver_username is null or ar.approver_full_name is null);

update public.access_requests
set requester_username = lower(btrim(requester_username))
where requester_username is not null
  and requester_username <> lower(btrim(requester_username));

update public.access_requests
set requester_email = lower(btrim(requester_email))
where requester_email is not null
  and requester_email <> lower(btrim(requester_email));

do $$
begin
  if to_regclass('public.admins') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'access_requests_requester_admin_fkey'
        and conrelid = 'public.access_requests'::regclass
    ) then
      alter table public.access_requests
        add constraint access_requests_requester_admin_fkey
        foreign key (requester_admin_id)
        references public.admins(id)
        on delete set null;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'access_requests_approver_admin_fkey'
        and conrelid = 'public.access_requests'::regclass
    ) then
      alter table public.access_requests
        add constraint access_requests_approver_admin_fkey
        foreign key (approver_admin_id)
        references public.admins(id)
        on delete set null;
    end if;
  end if;
end
$$;

create index if not exists access_requests_created_at_idx
  on public.access_requests (created_at desc);
create index if not exists access_requests_status_created_idx
  on public.access_requests (status, created_at desc);
create index if not exists access_requests_requested_module_idx
  on public.access_requests (requested_module_key);
create index if not exists access_requests_approver_admin_idx
  on public.access_requests (approver_admin_id);
create index if not exists access_requests_requester_admin_idx
  on public.access_requests (requester_admin_id);
create index if not exists access_requests_requester_user_idx
  on public.access_requests (requester_user_id);
create index if not exists access_requests_requester_username_lower_idx
  on public.access_requests (lower(requester_username));
create index if not exists access_requests_requester_email_lower_idx
  on public.access_requests (lower(requester_email));

commit;
