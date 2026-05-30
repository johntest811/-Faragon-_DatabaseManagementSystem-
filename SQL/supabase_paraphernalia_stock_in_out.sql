-- Paraphernalia Stock In / Stock Out support.
--
-- Run this in the Supabase SQL Editor before using the updated Paraphernalia
-- page. It is safe to rerun. Existing rows are preserved.

begin;

create extension if not exists pgcrypto;

create table if not exists public.paraphernalia_items (
  item_id uuid primary key default gen_random_uuid(),
  item_name text not null unique,
  item_category text not null default 'SEC'
    check (item_category in ('SEC', 'OFFICE')),
  display_order integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paraphernalia_detachment_tables (
  detachment_table_id uuid primary key default gen_random_uuid(),
  detachment text not null unique,
  client_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.paraphernalia_detachment_tables
  add column if not exists client_name text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if to_regclass('public.paraphernalia_detachment_tables') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'paraphernalia_detachment_tables_detachment_key'
         and conrelid = 'public.paraphernalia_detachment_tables'::regclass
     ) then
    alter table public.paraphernalia_detachment_tables
      add constraint paraphernalia_detachment_tables_detachment_key unique (detachment);
  end if;
end
$$;

alter table if exists public.paraphernalia_items
  add column if not exists item_category text not null default 'SEC',
  add column if not exists display_order integer,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

insert into public.paraphernalia_items (item_name, item_category, display_order, is_active)
values
  ('CIGNUS', 'SEC', 1, true),
  ('KENWOOD', 'SEC', 2, true),
  ('MOTOROLA', 'SEC', 4, true),
  ('VERSA', 'SEC', 5, true),
  ('IQONIC', 'SEC', 6, true),
  ('PHONE', 'SEC', 7, true),
  ('SATELLITE PHONE', 'SEC', 8, true),
  ('MEGAPHONE', 'SEC', 9, true),
  ('BINOCULAR', 'SEC', 10, true),
  ('BODYCAMERA', 'SEC', 12, true),
  ('BULLET PROOF VEST', 'SEC', 13, true),
  ('DRONE', 'SEC', 14, true),
  ('FIRE EXTINGUISHER', 'SEC', 15, true),
  ('GUARD TOUR SYSTEM', 'SEC', 16, true),
  ('HAND TALLY COUNTER', 'SEC', 17, true),
  ('INDUSTRIAL MASK', 'SEC', 18, true),
  ('LIFE RING', 'SEC', 19, true),
  ('LIFE VEST', 'SEC', 20, true),
  ('METAL DETECTOR', 'SEC', 21, true),
  ('NIGHT STICK', 'SEC', 22, true),
  ('SEARCH LIGHT', 'SEC', 23, true),
  ('SIGNAGE', 'SEC', 24, true),
  ('SPEED RADAR', 'SEC', 25, true),
  ('TRAFFIC CONE', 'SEC', 26, true),
  ('WALK THROUGH', 'SEC', 27, true),
  ('HARD HAT', 'SEC', 28, true),
  ('FLARE GUN', 'SEC', 29, true),
  ('PISTOL', 'SEC', 30, true),
  ('SHOTGUN', 'SEC', 31, true),
  ('TASER GUN', 'SEC', 32, true),
  ('EXTRA MAGAZINE 9MM', 'SEC', 33, true),
  ('BIKE', 'SEC', 34, true),
  ('MOBILE', 'SEC', 35, true),
  ('MOTORCYCLE', 'SEC', 36, true),
  ('SEABOURNE', 'SEC', 37, true),
  ('BP APPRATUS', 'SEC', 38, true),
  ('C-COLLAR', 'SEC', 39, true),
  ('CPR DUMMY', 'SEC', 40, true),
  ('FIRST AID CABINET', 'SEC', 41, true),
  ('FIRST AID KIT', 'SEC', 42, true),
  ('OXYGEN TANK', 'SEC', 43, true),
  ('SPINEBOARD', 'SEC', 44, true),
  ('STRETCHER', 'SEC', 45, true),
  ('WHEEL CHAIR', 'SEC', 46, true),
  ('AIRCON', 'OFFICE', 47, true),
  ('BIOMETRIC', 'OFFICE', 48, true),
  ('BUILT-IN-MONITOR', 'OFFICE', 49, true),
  ('BUNDYCLOCK', 'OFFICE', 50, true),
  ('DISCHARGE TUBE/BOX', 'OFFICE', 51, true),
  ('ELECTRICFAN', 'OFFICE', 52, true),
  ('INDUSTRIAL FAN', 'OFFICE', 53, true),
  ('LIFTING BELT', 'OFFICE', 54, true),
  ('MONITOR', 'OFFICE', 55, true),
  ('OFFICE TABLE', 'OFFICE', 56, true),
  ('PODIUM TABLE', 'OFFICE', 57, true),
  ('PRINTER', 'OFFICE', 58, true),
  ('PROJECTOR', 'OFFICE', 59, true),
  ('SAFETY VAULT', 'OFFICE', 60, true),
  ('STEEL CABINET', 'OFFICE', 61, true),
  ('STEEL LOCKER', 'OFFICE', 62, true),
  ('SYTEM UNIT', 'OFFICE', 63, true),
  ('LAPTOP', 'OFFICE', 64, true),
  ('CIGNUS CHARGER', 'OFFICE', 65, true),
  ('VERSA CHARGER', 'OFFICE', 66, true),
  ('SPARE BATTERY', 'OFFICE', 67, true),
  ('OFFICE CHAIR', 'OFFICE', 68, true),
  ('DOUBLE DECK', 'OFFICE', 69, true),
  ('XEROX MACHINE', 'OFFICE', 70, true)
on conflict (item_name) do update
set item_category = excluded.item_category,
    display_order = excluded.display_order,
    updated_at = now();

-- Stock Out rows live in public.paraphernalia.
alter table if exists public.paraphernalia
  add column if not exists status text default 'FREE',
  add column if not exists date_posted date,
  add column if not exists contract_id uuid,
  add column if not exists client_name text,
  add column if not exists specific_area text,
  add column if not exists control_number text;

do $$
begin
  if to_regclass('public.paraphernalia') is not null
     and to_regclass('public.contracts') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'paraphernalia_contract_id_fkey'
         and conrelid = 'public.paraphernalia'::regclass
     ) then
    alter table public.paraphernalia
      add constraint paraphernalia_contract_id_fkey
      foreign key (contract_id)
      references public.contracts(contract_id)
      on update cascade
      on delete set null;
  end if;
end
$$;

-- Stock In rows live in public.restock. Keep the existing misspelled
-- quanitity column for compatibility and add quantity for future-safe views.
alter table if exists public.restock
  add column if not exists attachment text,
  add column if not exists detachment text,
  add column if not exists client_name text,
  add column if not exists contract_id uuid,
  add column if not exists quantity numeric,
  add column if not exists control_number text;

update public.restock
set status = 'RE-STOCKED'
where upper(btrim(coalesce(status, ''))) = 'RECEIVED';

do $$
begin
  if to_regclass('public.restock') is not null
     and to_regclass('public.contracts') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'restock_contract_fkey'
         and conrelid = 'public.restock'::regclass
     )
     and not exists (
       select 1
       from pg_constraint
       where conname = 'restock_contract_id_fkey'
         and conrelid = 'public.restock'::regclass
     ) then
    alter table public.restock
      add constraint restock_contract_fkey
      foreign key (contract_id)
      references public.contracts(contract_id)
      on update cascade
      on delete set null;
  end if;
end
$$;

-- Keep the old inventory table compatible with the new computed inventory
-- sections. The page computes from Stock In/Out, and this metadata supports
-- reporting or future database-side refresh jobs.
alter table if exists public.paraphernalia_inventory
  add column if not exists client_name text,
  add column if not exists specific_area text,
  add column if not exists category text;

create index if not exists paraphernalia_contract_item_idx
  on public.paraphernalia (contract_id, items);

create index if not exists paraphernalia_specific_area_idx
  on public.paraphernalia (specific_area);

create index if not exists paraphernalia_control_number_idx
  on public.paraphernalia (control_number);

create index if not exists restock_contract_item_idx
  on public.restock (contract_id, item);

create index if not exists restock_detachment_idx
  on public.restock (detachment);

create index if not exists restock_control_number_idx
  on public.restock (control_number);

create or replace function public.paraphernalia_inventory_category(item_name text)
returns text
language sql
immutable
as $$
  select case
    when upper(btrim(coalesce(item_name, ''))) = any (array[
      'AIRCON',
      'BIOMETRIC',
      'BUILT-IN-MONITOR',
      'BUNDYCLOCK',
      'DISCHARGE TUBE/BOX',
      'ELECTRICFAN',
      'INDUSTRIAL FAN',
      'LIFTING BELT',
      'MONITOR',
      'OFFICE TABLE',
      'PODIUM TABLE',
      'PRINTER',
      'PROJECTOR',
      'SAFETY VAULT',
      'STEEL CABINET',
      'STEEL LOCKER',
      'SYTEM UNIT',
      'LAPTOP',
      'CIGNUS CHARGER',
      'VERSA CHARGER',
      'SPARE BATTERY',
      'OFFICE CHAIR',
      'DOUBLE DECK',
      'XEROX MACHINE'
    ]) then 'OFFICE'
    else 'SEC'
  end;
$$;

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

create or replace view public.vw_paraphernalia_inventory_summary as
with stock_in as (
  select
    r.contract_id,
    coalesce(nullif(btrim(r.client_name), ''), c.client_name, 'Unassigned Client') as client_name,
    coalesce(nullif(btrim(r.detachment), ''), c.specific_area, 'Unassigned Detachment') as specific_area,
    upper(btrim(r.item)) as item,
    coalesce(r.quantity, public.safe_numeric_text(r.quanitity), 0::numeric) as stock_in,
    0::numeric as stock_out
  from public.restock r
  left join public.contracts c on c.contract_id = r.contract_id
  where nullif(btrim(coalesce(r.item, '')), '') is not null
),
stock_out as (
  select
    p.contract_id,
    coalesce(nullif(btrim(p.client_name), ''), c.client_name, 'Unassigned Client') as client_name,
    coalesce(nullif(btrim(p.specific_area), ''), c.specific_area, 'Unassigned Detachment') as specific_area,
    upper(btrim(p.items::text)) as item,
    0::numeric as stock_in,
    coalesce(p.quantity::numeric, 0::numeric) as stock_out
  from public.paraphernalia p
  left join public.contracts c on c.contract_id = p.contract_id
  where nullif(btrim(coalesce(p.items::text, '')), '') is not null
),
combined as (
  select * from stock_in
  union all
  select * from stock_out
)
select
  contract_id,
  client_name,
  specific_area,
  item,
  coalesce(max(pi.item_category), public.paraphernalia_inventory_category(item)) as category,
  sum(stock_in) as stock_in,
  sum(stock_out) as stock_out,
  sum(stock_in) - sum(stock_out) as stock_balance
from combined
left join public.paraphernalia_items pi
  on upper(btrim(pi.item_name)) = combined.item
group by contract_id, client_name, specific_area, item;

-- Make the new permission keys visible for existing roles/accounts that
-- already had Paraphernalia column permissions configured. These blocks are
-- guarded so the migration still works on deployments without the RBAC tables.
do $$
begin
  if to_regclass('public.role_column_access') is not null
     and to_regclass('public.app_roles') is not null then
    execute $sql$
      with new_columns(column_key) as (
        values
          ('stock_in_timestamp'),
          ('stock_in_date'),
          ('stock_in_status'),
          ('stock_in_item'),
          ('stock_in_control_number'),
          ('stock_in_quantity'),
          ('stock_in_attachment'),
          ('stock_out_timestamp'),
          ('stock_out_date'),
          ('stock_out_names'),
          ('stock_out_items'),
          ('stock_out_control_number'),
          ('stock_out_qty'),
          ('stock_out_price'),
          ('stock_out_status'),
          ('stock_out_date_posted'),
          ('inventory_client_name'),
          ('inventory_items'),
          ('inventory_stock_balance'),
          ('inventory_stock_in'),
          ('inventory_stock_out'),
          ('import_file'),
          ('export_template'),
          ('export_file')
      ),
      roles_to_update as (
        select distinct role_id
        from public.role_column_access
        where module_key = 'paraphernalia'
        union
        select role_id
        from public.app_roles
        where role_name = 'superadmin'
      )
      insert into public.role_column_access (role_id, module_key, column_key, can_read)
      select r.role_id, 'paraphernalia', c.column_key, true
      from roles_to_update r
      cross join new_columns c
      on conflict (role_id, module_key, column_key) do nothing
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
          ('stock_in_timestamp'),
          ('stock_in_date'),
          ('stock_in_status'),
          ('stock_in_item'),
          ('stock_in_control_number'),
          ('stock_in_quantity'),
          ('stock_in_attachment'),
          ('stock_out_timestamp'),
          ('stock_out_date'),
          ('stock_out_names'),
          ('stock_out_items'),
          ('stock_out_control_number'),
          ('stock_out_qty'),
          ('stock_out_price'),
          ('stock_out_status'),
          ('stock_out_date_posted'),
          ('inventory_client_name'),
          ('inventory_items'),
          ('inventory_stock_balance'),
          ('inventory_stock_in'),
          ('inventory_stock_out'),
          ('import_file'),
          ('export_template'),
          ('export_file')
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
          ('stock_in_timestamp'),
          ('stock_in_date'),
          ('stock_in_status'),
          ('stock_in_item'),
          ('stock_in_control_number'),
          ('stock_in_quantity'),
          ('stock_in_attachment'),
          ('stock_out_timestamp'),
          ('stock_out_date'),
          ('stock_out_names'),
          ('stock_out_items'),
          ('stock_out_control_number'),
          ('stock_out_qty'),
          ('stock_out_price'),
          ('stock_out_status'),
          ('stock_out_date_posted'),
          ('inventory_client_name'),
          ('inventory_items'),
          ('inventory_stock_balance'),
          ('inventory_stock_in'),
          ('inventory_stock_out'),
          ('import_file'),
          ('export_template'),
          ('export_file')
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

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

commit;
