-- Restrict Paraphernalia detachment table definitions to Client Specific Areas.
--
-- Paste this entire file into the Supabase SQL Editor and run it once. It is
-- safe to rerun. Obsolete navigation definitions are deleted, but Stock In,
-- Stock Out, and inventory history records are preserved.

begin;

create or replace function public.paraphernalia_detachment_area_key(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '[[:space:]]+', ' ', 'g'));
$$;

-- Remove duplicate definitions that differ only by capitalization or spacing.
delete from public.paraphernalia_detachment_tables duplicate
using public.paraphernalia_detachment_tables keeper
where public.paraphernalia_detachment_area_key(duplicate.detachment)
    = public.paraphernalia_detachment_area_key(keeper.detachment)
  and duplicate.detachment_table_id > keeper.detachment_table_id;

-- Remove table definitions that no longer correspond to a Client Specific Area.
-- Transaction rows are intentionally not touched.
delete from public.paraphernalia_detachment_tables table_definition
where not exists (
  select 1
  from public.contracts contract
  where nullif(public.paraphernalia_detachment_area_key(contract.specific_area), '') is not null
    and public.paraphernalia_detachment_area_key(contract.specific_area)
      = public.paraphernalia_detachment_area_key(table_definition.detachment)
);

-- Normalize retained definitions to the exact spelling used by the Client page.
with canonical_contract_areas as (
  select distinct on (public.paraphernalia_detachment_area_key(contract.specific_area))
    public.paraphernalia_detachment_area_key(contract.specific_area) as area_key,
    contract.specific_area,
    contract.client_name
  from public.contracts contract
  where nullif(public.paraphernalia_detachment_area_key(contract.specific_area), '') is not null
  order by
    public.paraphernalia_detachment_area_key(contract.specific_area),
    contract.created_at desc nulls last
)
update public.paraphernalia_detachment_tables table_definition
set detachment = contract_area.specific_area,
    client_name = coalesce(nullif(btrim(table_definition.client_name), ''), contract_area.client_name),
    updated_at = now()
from canonical_contract_areas contract_area
where contract_area.area_key
    = public.paraphernalia_detachment_area_key(table_definition.detachment);

create or replace function public.validate_paraphernalia_detachment_table_area()
returns trigger
language plpgsql
as $$
declare
  canonical_area text;
  canonical_client text;
begin
  select contract.specific_area, contract.client_name
  into canonical_area, canonical_client
  from public.contracts contract
  where nullif(public.paraphernalia_detachment_area_key(contract.specific_area), '') is not null
    and public.paraphernalia_detachment_area_key(contract.specific_area)
      = public.paraphernalia_detachment_area_key(new.detachment)
  order by contract.created_at desc nulls last
  limit 1;

  if canonical_area is null then
    raise exception using
      errcode = '23514',
      message = 'Paraphernalia detachment tables must use an existing Client Specific Area.';
  end if;

  new.detachment := canonical_area;
  new.client_name := coalesce(nullif(btrim(new.client_name), ''), canonical_client);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists paraphernalia_detachment_table_area_check
  on public.paraphernalia_detachment_tables;

create trigger paraphernalia_detachment_table_area_check
before insert or update of detachment, client_name
on public.paraphernalia_detachment_tables
for each row
execute function public.validate_paraphernalia_detachment_table_area();

-- The application signs in through public.admins, so browser requests reach
-- Supabase as anon. Grants alone do not bypass RLS; application RBAC controls
-- which signed-in users can see the create and delete actions.
alter table public.paraphernalia_detachment_tables enable row level security;

drop policy if exists paraphernalia_detachment_tables_legacy_app_access
  on public.paraphernalia_detachment_tables;

create policy paraphernalia_detachment_tables_legacy_app_access
  on public.paraphernalia_detachment_tables
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.paraphernalia_detachment_tables
  to anon, authenticated, service_role;
grant execute on function public.paraphernalia_detachment_area_key(text)
  to anon, authenticated, service_role;
grant execute on function public.validate_paraphernalia_detachment_table_area()
  to anon, authenticated, service_role;

commit;

-- Optional verification: every row returned here is a valid Client area.
-- select detachment, client_name, is_active
-- from public.paraphernalia_detachment_tables
-- order by detachment;

-- Optional RLS verification. This should return one row containing anon and
-- authenticated in the roles column.
-- select schemaname, tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'paraphernalia_detachment_tables'
--   and policyname = 'paraphernalia_detachment_tables_legacy_app_access';
