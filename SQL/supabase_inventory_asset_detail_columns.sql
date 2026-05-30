-- Inventory asset detail columns and API permissions.
--
-- Run this in the Supabase SQL Editor before using the updated Inventory page.
-- It is safe to rerun. Existing inventory rows are preserved.

begin;

alter table if exists public.inventory_fixed_asset
  add column if not exists equipment text,
  add column if not exists control_number text,
  add column if not exists serial_plate_number text,
  add column if not exists maker text,
  add column if not exists model_number text,
  add column if not exists detachment text,
  add column if not exists unit_cost numeric,
  add column if not exists date_purchased date,
  add column if not exists expiration date,
  add column if not exists last_maintenance date,
  add column if not exists user_text text,
  add column if not exists user_attachment text;

create index if not exists inventory_fixed_asset_control_number_idx
  on public.inventory_fixed_asset (control_number);

create index if not exists inventory_fixed_asset_equipment_idx
  on public.inventory_fixed_asset (equipment);

create index if not exists inventory_fixed_asset_detachment_idx
  on public.inventory_fixed_asset (detachment);

-- Make the new Inventory permission keys available to roles/accounts that
-- already had Inventory column permissions configured.
do $$
begin
  if to_regclass('public.role_column_access') is not null
     and to_regclass('public.app_roles') is not null then
    execute $sql$
      with new_columns(column_key) as (
        values
          ('equipment'),
          ('control_number'),
          ('serial_plate_number'),
          ('maker'),
          ('model_number'),
          ('detachment'),
          ('unit_cost'),
          ('date_purchased'),
          ('expiration'),
          ('last_maintenance'),
          ('user')
      ),
      roles_to_update as (
        select distinct role_id
        from public.role_column_access
        where module_key = 'inventory'
        union
        select role_id
        from public.app_roles
        where role_name = 'superadmin'
      )
      insert into public.role_column_access (role_id, module_key, column_key, can_read)
      select r.role_id, 'inventory', c.column_key, true
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
          ('equipment'),
          ('control_number'),
          ('serial_plate_number'),
          ('maker'),
          ('model_number'),
          ('detachment'),
          ('unit_cost'),
          ('date_purchased'),
          ('expiration'),
          ('last_maintenance'),
          ('user')
      ),
      admins_to_update as (
        select distinct admin_id
        from public.admin_column_access_overrides
        where module_key = 'inventory'
      )
      insert into public.admin_column_access_overrides (admin_id, module_key, column_key, can_read)
      select a.admin_id, 'inventory', c.column_key, true
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
          ('equipment'),
          ('control_number'),
          ('serial_plate_number'),
          ('maker'),
          ('model_number'),
          ('detachment'),
          ('unit_cost'),
          ('date_purchased'),
          ('expiration'),
          ('last_maintenance'),
          ('user')
      ),
      users_to_update as (
        select distinct user_id
        from public.user_column_access_overrides
        where module_key = 'inventory'
      )
      insert into public.user_column_access_overrides (user_id, module_key, column_key, can_read)
      select u.user_id, 'inventory', c.column_key, true
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
