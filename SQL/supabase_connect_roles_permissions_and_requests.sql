-- Connect Roles <-> Permissions and harden request visibility.
-- Safe to run multiple times.

begin;

-- 1) Keep legacy admins.role values normalized and backed by app_roles.
update public.admins
set role = lower(btrim(role))
where role is not null
  and role <> lower(btrim(role));

insert into public.app_roles (role_name)
select distinct lower(btrim(a.role))
from public.admins a
where nullif(btrim(a.role), '') is not null
on conflict (role_name) do nothing;

create or replace function public.trg_sync_admin_role_to_app_roles()
returns trigger
language plpgsql
as $$
begin
  new.role := lower(btrim(coalesce(new.role, '')));
  if new.role = '' then
    raise exception 'admins.role cannot be empty';
  end if;

  insert into public.app_roles (role_name)
  values (new.role)
  on conflict (role_name) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_admins_sync_role_to_app_roles on public.admins;
create trigger trg_admins_sync_role_to_app_roles
before insert or update of role on public.admins
for each row
execute function public.trg_sync_admin_role_to_app_roles();

create index if not exists admins_role_idx
  on public.admins (role);

-- 1b) Ensure role_column_access exists for role-level column permissions.
create table if not exists public.role_column_access (
  role_id uuid not null,
  module_key text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid,
  constraint role_column_access_pkey primary key (role_id, module_key, column_key),
  constraint role_column_access_role_id_fkey foreign key (role_id) references public.app_roles(role_id),
  constraint role_column_access_module_key_fkey foreign key (module_key) references public.modules(module_key)
);

create index if not exists role_column_access_role_module_idx
  on public.role_column_access (role_id, module_key);

create index if not exists role_column_access_module_idx
  on public.role_column_access (module_key);

-- 1c) Enforce superadmin default full page and column permissions.
insert into public.app_roles (role_name)
values ('superadmin')
on conflict (role_name) do nothing;

with superadmin_role as (
  select role_id from public.app_roles where role_name = 'superadmin' limit 1
), all_modules as (
  select module_key from public.modules
)
insert into public.role_module_access (role_id, module_key, can_read, can_write)
select s.role_id, m.module_key, true, true
from superadmin_role s
cross join all_modules m
on conflict (role_id, module_key) do update
set can_read = true,
    can_write = true;

with superadmin_role as (
  select role_id from public.app_roles where role_name = 'superadmin' limit 1
), module_column_catalog(module_key, column_key) as (
  values
    ('dashboard', 'kpi_total_employees'),
    ('dashboard', 'kpi_active_employees'),
    ('dashboard', 'kpi_archived'),
    ('dashboard', 'kpi_pending_requests'),

    ('employees', 'custom_id'),
    ('employees', 'first_name'),
    ('employees', 'middle_name'),
    ('employees', 'last_name'),
    ('employees', 'client_position'),
    ('employees', 'detachment'),
    ('employees', 'status'),
    ('employees', 'date_hired_fsai'),
    ('employees', 'client_email'),
    ('employees', 'client_contact_num'),
    ('employees', 'gender'),
    ('employees', 'birth_date'),
    ('employees', 'age'),
    ('employees', 'profile_image_path'),
    ('employees', 'import_file'),
    ('employees', 'export_template'),
    ('employees', 'export_file'),

    ('reassign', 'applicant_id'),
    ('reassign', 'first_name'),
    ('reassign', 'last_name'),
    ('reassign', 'detachment'),
    ('reassign', 'status'),
    ('reassign', 'updated_at'),

    ('resigned', 'applicant_id'),
    ('resigned', 'first_name'),
    ('resigned', 'last_name'),
    ('resigned', 'date_resigned'),
    ('resigned', 'last_duty'),
    ('resigned', 'status'),

    ('retired', 'applicant_id'),
    ('retired', 'first_name'),
    ('retired', 'last_name'),
    ('retired', 'retired_at'),
    ('retired', 'retired_by'),
    ('retired', 'status'),

    ('archive', 'applicant_id'),
    ('archive', 'first_name'),
    ('archive', 'last_name'),
    ('archive', 'archived_at'),
    ('archive', 'archived_by'),
    ('archive', 'status'),

    ('client', 'contract_no'),
    ('client', 'contract_no_date'),
    ('client', 'client_name'),
    ('client', 'project_name'),
    ('client', 'specific_area'),
    ('client', 'cluster'),
    ('client', 'contract_start'),
    ('client', 'contract_end'),
    ('client', 'contracted_manpower'),
    ('client', 'deployed_guards'),
    ('client', 'status'),
    ('client', 'created_at'),
    ('client', 'remarks'),
    ('client', 'import_file'),
    ('client', 'export_template'),
    ('client', 'export_file'),

    ('inventory', 'date'),
    ('inventory', 'particular'),
    ('inventory', 'quanitity'),
    ('inventory', 'amount'),
    ('inventory', 'remarks'),
    ('inventory', 'firearms_name'),
    ('inventory', 'communications_name'),
    ('inventory', 'furniture_name'),
    ('inventory', 'office_name'),
    ('inventory', 'sec_name'),
    ('inventory', 'vehicle_name'),
    ('inventory', 'total_amount'),
    ('inventory', 'grand_total'),
    ('inventory', 'import_file'),
    ('inventory', 'export_template'),
    ('inventory', 'export_file'),

    ('paraphernalia', 'names'),
    ('paraphernalia', 'items'),
    ('paraphernalia', 'quantity'),
    ('paraphernalia', 'price'),
    ('paraphernalia', 'date'),
    ('paraphernalia', 'stock_balance'),
    ('paraphernalia', 'stock_in'),
    ('paraphernalia', 'stock_out'),
    ('paraphernalia', 'restock_status'),
    ('paraphernalia', 'restock_item'),
    ('paraphernalia', 'restock_quantity'),
    ('paraphernalia', 'import_file'),
    ('paraphernalia', 'export_template'),
    ('paraphernalia', 'export_file'),

    ('reports', 'report_type'),
    ('reports', 'date_from'),
    ('reports', 'date_to'),
    ('reports', 'generated_by'),
    ('reports', 'generated_at'),
    ('reports', 'total_records'),

    ('requests', 'request_scope_row'),
    ('requests', 'request_scope_column'),
    ('requests', 'requested_module_key'),
    ('requests', 'requested_column_keys'),
    ('requests', 'requested_column_key'),
    ('requests', 'requested_applicant_ids'),
    ('requests', 'requested_applicant_id'),
    ('requests', 'requested_row_identifier_key'),
    ('requests', 'requested_row_identifier_values'),
    ('requests', 'requested_row_identifier_value'),
    ('requests', 'requester_role'),
    ('requests', 'requester_username'),
    ('requests', 'approver_admin_id'),
    ('requests', 'status'),
    ('requests', 'resolved_by'),
    ('requests', 'resolved_at'),

    ('audit', 'actor_user_id'),
    ('audit', 'actor_email'),
    ('audit', 'action'),
    ('audit', 'page'),
    ('audit', 'details'),
    ('audit', 'created_at'),

    ('settings', 'setting_key'),
    ('settings', 'setting_value'),
    ('settings', 'updated_by'),
    ('settings', 'updated_at'),

    ('access', 'username'),
    ('access', 'role'),
    ('access', 'full_name'),
    ('access', 'is_active'),
    ('access', 'created_at'),

    ('logistics', 'client'),
    ('logistics', 'inventory'),
    ('logistics', 'paraphernalia'),
    ('logistics', 'reports')
)
insert into public.role_column_access (role_id, module_key, column_key, can_read)
select s.role_id, c.module_key, c.column_key, true
from superadmin_role s
join module_column_catalog c on true
on conflict (role_id, module_key, column_key) do update
set can_read = true;

-- 2) Ensure every role_column_access row has a matching role_module_access row.
insert into public.role_module_access (role_id, module_key, can_read, can_write)
select distinct rca.role_id, rca.module_key, true, false
from public.role_column_access rca
left join public.role_module_access rma
  on rma.role_id = rca.role_id
 and rma.module_key = rca.module_key
where rma.role_id is null
on conflict (role_id, module_key) do nothing;

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
for each row
execute function public.trg_ensure_role_module_access_for_column_access();

do $$
begin
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
      on delete cascade
      not valid;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'role_column_access_role_module_fkey'
      and conrelid = 'public.role_column_access'::regclass
      and not convalidated
  ) then
    alter table public.role_column_access
      validate constraint role_column_access_role_module_fkey;
  end if;
end
$$;

-- 3) Keep access request rows visible in requester history/reviewer queue.
alter table public.access_requests add column if not exists request_scope_row boolean;
alter table public.access_requests add column if not exists request_scope_column boolean;
alter table public.access_requests add column if not exists requested_column_keys text[];
alter table public.access_requests add column if not exists requested_applicant_ids text[];
alter table public.access_requests add column if not exists requested_row_identifier_key text;
alter table public.access_requests add column if not exists requested_row_identifier_values text[];
alter table public.access_requests add column if not exists approver_admin_id uuid;
alter table public.access_requests add column if not exists approver_username text;
alter table public.access_requests add column if not exists approver_full_name text;
alter table public.access_requests add column if not exists requester_username text;
alter table public.access_requests add column if not exists requester_email text;
alter table public.access_requests add column if not exists requester_admin_id uuid;
alter table public.access_requests add column if not exists requester_user_id uuid;

update public.access_requests
set request_scope_row = false
where request_scope_row is null;

update public.access_requests
set request_scope_column = false
where request_scope_column is null;

alter table public.access_requests
  alter column request_scope_row set default false;

alter table public.access_requests
  alter column request_scope_column set default false;

do $$
begin
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
end
$$;

update public.access_requests
set requester_username = lower(btrim(requester_username))
where requester_username is not null
  and requester_username <> lower(btrim(requester_username));

update public.access_requests
set requester_email = lower(btrim(requester_email))
where requester_email is not null
  and requester_email <> lower(btrim(requester_email));

update public.access_requests
set status = 'PENDING'
where status is null or btrim(status) = '';

update public.access_requests
set status = upper(btrim(status))
where status is not null
  and status <> upper(btrim(status));

update public.access_requests
set status = 'PENDING'
where status not in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

alter table public.access_requests
  alter column status set default 'PENDING';

alter table public.access_requests
  alter column status set not null;

alter table public.access_requests
  drop constraint if exists access_requests_status_check;

alter table public.access_requests
  add constraint access_requests_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

create index if not exists access_requests_status_created_idx
  on public.access_requests (status, created_at desc);

create index if not exists access_requests_requester_user_idx
  on public.access_requests (requester_user_id);

create index if not exists access_requests_requester_admin_idx
  on public.access_requests (requester_admin_id);

create index if not exists access_requests_requester_email_lower_idx
  on public.access_requests (lower(requester_email));

create index if not exists access_requests_requester_username_lower_idx
  on public.access_requests (lower(requester_username));

create index if not exists access_requests_approver_admin_idx
  on public.access_requests (approver_admin_id);

commit;
