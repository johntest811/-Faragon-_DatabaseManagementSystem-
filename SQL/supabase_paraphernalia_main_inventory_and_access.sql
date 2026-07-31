-- FARAGON main Paraphernalia inventory, item prices, and account detachment access.
--
-- Paste this entire file into the Supabase SQL Editor and run it once before
-- using the updated Admin Accounts and Paraphernalia pages. It is safe to rerun.

begin;

create extension if not exists pgcrypto;

alter table if exists public.admins
  add column if not exists assigned_detachment text,
  add column if not exists applicant_id uuid;

comment on column public.admins.assigned_detachment is
  'Optional Paraphernalia assignment. Employee-linked Security Accounts are limited to the assigned detachment; administrative FARAGON assignments retain full access.';

comment on column public.admins.applicant_id is
  'Optional link to the active employee record used to create this login account.';

do $$
begin
  if to_regclass('public.admins') is not null
     and to_regclass('public.applicants') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'admins_applicant_id_fkey'
         and conrelid = 'public.admins'::regclass
     ) then
    alter table public.admins
      add constraint admins_applicant_id_fkey
      foreign key (applicant_id)
      references public.applicants(applicant_id)
      on update cascade
      on delete set null;
  end if;
end
$$;

create index if not exists admins_assigned_detachment_idx
  on public.admins (assigned_detachment);

create unique index if not exists admins_applicant_id_unique_idx
  on public.admins (applicant_id)
  where applicant_id is not null;

-- Linked employee accounts always follow the current Employees-page
-- detachment and ID number instead of keeping a stale account assignment.
create or replace function public.sync_linked_admin_from_applicant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admins
  set assigned_detachment = nullif(btrim(new.detachment::text), ''),
      employee_number = nullif(btrim(new.custom_id::text), '')
  where applicant_id = new.applicant_id;
  return new;
end;
$$;

drop trigger if exists applicants_sync_linked_admin_trigger on public.applicants;

create trigger applicants_sync_linked_admin_trigger
after update of detachment, custom_id on public.applicants
for each row
execute function public.sync_linked_admin_from_applicant();

-- The function is used only by the trigger and must not be callable through
-- the public Data API.
revoke all on function public.sync_linked_admin_from_applicant()
  from public, anon, authenticated;

update public.admins a
set assigned_detachment = nullif(btrim(ap.detachment::text), ''),
    employee_number = coalesce(nullif(btrim(ap.custom_id::text), ''), a.employee_number)
from public.applicants ap
where a.applicant_id = ap.applicant_id;

alter table if exists public.paraphernalia_items
  add column if not exists unit_price numeric not null default 0;

update public.paraphernalia_items
set unit_price = 0
where unit_price is null or unit_price < 0;

do $$
begin
  if to_regclass('public.paraphernalia_items') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'paraphernalia_items_unit_price_check'
         and conrelid = 'public.paraphernalia_items'::regclass
     ) then
    alter table public.paraphernalia_items
      add constraint paraphernalia_items_unit_price_check
      check (unit_price >= 0);
  end if;
end
$$;

-- This application uses its legacy admins table for sign-in, so browser Data
-- API calls reach Supabase as the anon role. Table grants do not bypass RLS;
-- this policy is required for Manage Paraphernalia Items to create, edit, and
-- soft-delete catalog entries. Application RBAC still controls who sees these
-- actions in the interface.
alter table public.paraphernalia_items enable row level security;

drop policy if exists paraphernalia_items_legacy_app_access
  on public.paraphernalia_items;

create policy paraphernalia_items_legacy_app_access
  on public.paraphernalia_items
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- These scope tables support role defaults and account-specific overrides.
-- The admins.assigned_detachment value takes priority when it is populated.
create table if not exists public.role_paraphernalia_detachment_access (
  role_id uuid not null references public.app_roles(role_id) on delete cascade,
  detachment text not null,
  can_stock_out boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_id, detachment),
  check (nullif(btrim(detachment), '') is not null)
);

create table if not exists public.admin_paraphernalia_access_settings (
  admin_id uuid primary key references public.admins(id) on delete cascade,
  use_custom_detachments boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_paraphernalia_detachment_access (
  admin_id uuid not null references public.admins(id) on delete cascade,
  detachment text not null,
  can_stock_out boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (admin_id, detachment),
  check (nullif(btrim(detachment), '') is not null)
);

create index if not exists role_paraphernalia_detachment_access_detachment_idx
  on public.role_paraphernalia_detachment_access (detachment);

create index if not exists admin_paraphernalia_detachment_access_detachment_idx
  on public.admin_paraphernalia_detachment_access (detachment);

create or replace function public.safe_numeric_text(value text)
returns numeric
language sql
immutable
as $$
  select case
    when btrim(coalesce(value, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
      then btrim(value)::numeric
    else 0::numeric
  end;
$$;

-- Main availability includes every active catalog item. Receipts into FARAGON
-- increase it. Stock allocated through a detachment Stock In, plus any direct
-- FARAGON Stock Out, decrease it. A detachment's later employee Stock Out is
-- not deducted from FARAGON again.
create or replace view public.vw_paraphernalia_main_inventory
with (security_invoker = true) as
with stock_in_base as (
  select
    upper(btrim(r.item)) as item,
    coalesce(r.quantity, public.safe_numeric_text(r.quanitity), 0::numeric) as quantity,
    lower(regexp_replace(btrim(coalesce(nullif(btrim(r.detachment), ''), c.specific_area, '')), '[[:space:]]+', ' ', 'g')) as area_key
  from public.restock r
  left join public.contracts c on c.contract_id = r.contract_id
  where nullif(btrim(coalesce(r.item, '')), '') is not null
),
main_stock_in as (
  select item, sum(quantity) as stock_in
  from stock_in_base
  where area_key in ('', 'faragon', 'faragon main logistics')
  group by item
),
detachment_allocations as (
  select item, sum(quantity) as stock_out
  from stock_in_base
  where area_key not in ('', 'faragon', 'faragon main logistics')
  group by item
),
stock_out_base as (
  select
    upper(btrim(p.items::text)) as item,
    coalesce(p.quantity::numeric, 0::numeric) as quantity,
    lower(regexp_replace(btrim(coalesce(nullif(btrim(p.specific_area), ''), c.specific_area, '')), '[[:space:]]+', ' ', 'g')) as area_key
  from public.paraphernalia p
  left join public.contracts c on c.contract_id = p.contract_id
  where nullif(btrim(coalesce(p.items::text, '')), '') is not null
),
direct_main_stock_out as (
  select item, sum(quantity) as stock_out
  from stock_out_base
  where area_key in ('', 'faragon', 'faragon main logistics')
  group by item
),
stock_out as (
  select item, sum(stock_out) as stock_out
  from (
    select item, stock_out from detachment_allocations
    union all
    select item, stock_out from direct_main_stock_out
  ) movements
  group by item
)
select
  pi.item_id,
  pi.item_name,
  pi.item_category,
  pi.unit_price,
  coalesce(si.stock_in, 0::numeric) as stock_in,
  coalesce(so.stock_out, 0::numeric) as stock_out,
  coalesce(si.stock_in, 0::numeric) - coalesce(so.stock_out, 0::numeric) as stock_balance,
  (coalesce(si.stock_in, 0::numeric) - coalesce(so.stock_out, 0::numeric)) * pi.unit_price as inventory_value
from public.paraphernalia_items pi
left join main_stock_in si on si.item = upper(btrim(pi.item_name))
left join stock_out so on so.item = upper(btrim(pi.item_name))
where pi.is_active = true;

-- Control numbers are no longer shown or imported by the application. Keep
-- the legacy database columns so existing stock records are never destroyed.
delete from public.role_column_access
where module_key = 'paraphernalia'
  and column_key in ('stock_in_control_number', 'stock_out_control_number');

delete from public.admin_column_access_overrides
where module_key = 'paraphernalia'
  and column_key in ('stock_in_control_number', 'stock_out_control_number');

delete from public.user_column_access_overrides
where module_key = 'paraphernalia'
  and column_key in ('stock_in_control_number', 'stock_out_control_number');

-- Preserve existing Paraphernalia roles and add the new visible actions and
-- FARAGON main-inventory columns. Employee is configured separately below.
do $$
begin
  if to_regclass('public.role_column_access') is not null
     and to_regclass('public.app_roles') is not null then
    execute $sql$
      with new_columns(column_key) as (
        values
          ('main_inventory_item'),
          ('main_inventory_category'),
          ('main_inventory_unit_price'),
          ('main_inventory_stock_in'),
          ('main_inventory_stock_out'),
          ('main_inventory_balance'),
          ('main_inventory_value'),
          ('manage_items'),
          ('add_stock_in'),
          ('add_stock_out')
      ),
      roles_to_update as (
        select distinct rca.role_id
        from public.role_column_access rca
        join public.app_roles ar on ar.role_id = rca.role_id
        where rca.module_key = 'paraphernalia'
          and lower(btrim(ar.role_name)) <> 'employee'
        union
        select role_id
        from public.app_roles
        where lower(btrim(role_name)) = 'superadmin'
      )
      insert into public.role_column_access (role_id, module_key, column_key, can_read)
      select r.role_id, 'paraphernalia', c.column_key, true
      from roles_to_update r
      cross join new_columns c
      on conflict (role_id, module_key, column_key) do update
      set can_read = true,
          updated_at = now()
    $sql$;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.admin_column_access_overrides') is not null then
    execute $sql$
      with new_columns(column_key) as (
        values
          ('main_inventory_item'),
          ('main_inventory_category'),
          ('main_inventory_unit_price'),
          ('main_inventory_stock_in'),
          ('main_inventory_stock_out'),
          ('main_inventory_balance'),
          ('main_inventory_value'),
          ('manage_items'),
          ('add_stock_in'),
          ('add_stock_out')
      ),
      admins_to_update as (
        select distinct admin_id
        from public.admin_column_access_overrides
        where module_key = 'paraphernalia'
      )
      insert into public.admin_column_access_overrides (admin_id, module_key, column_key, can_read)
      select a.admin_id, 'paraphernalia', c.column_key, true
      from admins_to_update a
      cross join new_columns c
      on conflict (admin_id, module_key, column_key) do nothing
    $sql$;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.user_column_access_overrides') is not null then
    execute $sql$
      with new_columns(column_key) as (
        values
          ('main_inventory_item'),
          ('main_inventory_category'),
          ('main_inventory_unit_price'),
          ('main_inventory_stock_in'),
          ('main_inventory_stock_out'),
          ('main_inventory_balance'),
          ('main_inventory_value'),
          ('manage_items'),
          ('add_stock_in'),
          ('add_stock_out')
      ),
      users_to_update as (
        select distinct user_id
        from public.user_column_access_overrides
        where module_key = 'paraphernalia'
      )
      insert into public.user_column_access_overrides (user_id, module_key, column_key, can_read)
      select u.user_id, 'paraphernalia', c.column_key, true
      from users_to_update u
      cross join new_columns c
      on conflict (user_id, module_key, column_key) do nothing
    $sql$;
  end if;
end
$$;

-- Employee accounts can enter only their assigned detachment table, view
-- Stock In and both inventory summaries, and use Add Stock Out.
insert into public.app_roles (role_name)
values ('employee')
on conflict (role_name) do nothing;

insert into public.role_module_access (role_id, module_key, can_read, can_write, can_edit)
select role_id, 'paraphernalia', true, false, false
from public.app_roles
where lower(btrim(role_name)) = 'employee'
on conflict (role_id, module_key) do update
set can_read = true,
    can_write = false,
    can_edit = false;

delete from public.role_column_access rca
using public.app_roles ar
where rca.role_id = ar.role_id
  and rca.module_key = 'paraphernalia'
  and lower(btrim(ar.role_name)) = 'employee';

insert into public.role_column_access (role_id, module_key, column_key, can_read)
select ar.role_id, 'paraphernalia', column_key, true
from public.app_roles ar
cross join (
  values
    ('stock_in_timestamp'),
    ('stock_in_date'),
    ('stock_in_status'),
    ('stock_in_item'),
    ('stock_in_quantity'),
    ('stock_in_attachment'),
    ('inventory_client_name'),
    ('inventory_items'),
    ('inventory_stock_balance'),
    ('inventory_stock_in'),
    ('inventory_stock_out'),
    ('add_stock_out')
) as permitted(column_key)
where lower(btrim(ar.role_name)) = 'employee'
on conflict (role_id, module_key, column_key) do update
set can_read = true,
    updated_at = now();

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on table public.admins to anon, authenticated, service_role;
grant all privileges on table public.paraphernalia_items to anon, authenticated, service_role;
grant all privileges on table public.role_paraphernalia_detachment_access to anon, authenticated, service_role;
grant all privileges on table public.admin_paraphernalia_access_settings to anon, authenticated, service_role;
grant all privileges on table public.admin_paraphernalia_detachment_access to anon, authenticated, service_role;
grant select on table public.vw_paraphernalia_main_inventory to anon, authenticated, service_role;

commit;
