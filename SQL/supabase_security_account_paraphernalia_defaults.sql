-- Restrict employee-linked Security Accounts to their assigned Paraphernalia table.
--
-- Paste this entire file into the Supabase SQL Editor and run it once after
-- deploying the updated application. It is safe to rerun. A Security Account
-- is an admins row linked to an employee through admins.applicant_id.

begin;

-- Keep the account assignment synchronized with the employee detachment when
-- an older linked account does not have an assignment yet.
update public.admins a
set assigned_detachment = nullif(btrim(ap.detachment::text), '')
from public.applicants ap
where a.applicant_id = ap.applicant_id
  and nullif(btrim(coalesce(a.assigned_detachment, '')), '') is null
  and nullif(btrim(coalesce(ap.detachment::text, '')), '') is not null;

-- Position roles used by Security Accounts receive a clean default. The
-- Superadmin role is intentionally excluded and remains unrestricted.
with security_roles as (
  select distinct ar.role_id
  from public.admins a
  join public.app_roles ar
    on lower(btrim(ar.role_name)) = lower(btrim(a.role))
  where a.applicant_id is not null
    and lower(btrim(ar.role_name)) <> 'superadmin'
)
delete from public.role_column_access rca
using security_roles sr
where rca.role_id = sr.role_id;

with security_roles as (
  select distinct ar.role_id
  from public.admins a
  join public.app_roles ar
    on lower(btrim(ar.role_name)) = lower(btrim(a.role))
  where a.applicant_id is not null
    and lower(btrim(ar.role_name)) <> 'superadmin'
)
delete from public.role_module_access rma
using security_roles sr
where rma.role_id = sr.role_id;

-- The account's admins.assigned_detachment is now the single source of its
-- Paraphernalia table restriction, so legacy role-level scopes are removed.
with security_roles as (
  select distinct ar.role_id
  from public.admins a
  join public.app_roles ar
    on lower(btrim(ar.role_name)) = lower(btrim(a.role))
  where a.applicant_id is not null
    and lower(btrim(ar.role_name)) <> 'superadmin'
)
delete from public.role_paraphernalia_detachment_access rpda
using security_roles sr
where rpda.role_id = sr.role_id;

-- Security Accounts cannot expand their fixed role through individual account
-- overrides in the Permissions tab.
delete from public.admin_column_access_overrides acao
using public.admins a
where acao.admin_id = a.id
  and a.applicant_id is not null;

delete from public.admin_module_access_overrides amao
using public.admins a
where amao.admin_id = a.id
  and a.applicant_id is not null;

with security_roles as (
  select distinct ar.role_id
  from public.admins a
  join public.app_roles ar
    on lower(btrim(ar.role_name)) = lower(btrim(a.role))
  where a.applicant_id is not null
    and lower(btrim(ar.role_name)) <> 'superadmin'
)
insert into public.role_module_access (
  role_id,
  module_key,
  can_read,
  can_write,
  can_edit
)
select
  sr.role_id,
  'paraphernalia',
  true,
  false,
  false
from security_roles sr
on conflict (role_id, module_key) do update
set can_read = excluded.can_read,
    can_write = excluded.can_write,
    can_edit = excluded.can_edit;

with security_roles as (
  select distinct ar.role_id
  from public.admins a
  join public.app_roles ar
    on lower(btrim(ar.role_name)) = lower(btrim(a.role))
  where a.applicant_id is not null
    and lower(btrim(ar.role_name)) <> 'superadmin'
),
allowed_columns(column_key) as (
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
)
insert into public.role_column_access (
  role_id,
  module_key,
  column_key,
  can_read
)
select
  sr.role_id,
  'paraphernalia',
  ac.column_key,
  true
from security_roles sr
cross join allowed_columns ac
on conflict (role_id, module_key, column_key) do update
set can_read = excluded.can_read;

grant usage on schema public to anon, authenticated, service_role;
grant select, update on table public.admins to anon, authenticated, service_role;
grant select on table public.applicants to anon, authenticated, service_role;
grant all privileges on table public.role_module_access to anon, authenticated, service_role;
grant all privileges on table public.role_column_access to anon, authenticated, service_role;
grant all privileges on table public.role_paraphernalia_detachment_access to anon, authenticated, service_role;
grant all privileges on table public.admin_module_access_overrides to anon, authenticated, service_role;
grant all privileges on table public.admin_column_access_overrides to anon, authenticated, service_role;

commit;

-- Optional verification: every linked Security Account should return only the
-- Paraphernalia module and the twelve fixed permission keys above.
--
-- select a.username, a.assigned_detachment, ar.role_name,
--        rma.module_key, rma.can_read, rma.can_write, rma.can_edit
-- from public.admins a
-- join public.app_roles ar on lower(btrim(ar.role_name)) = lower(btrim(a.role))
-- left join public.role_module_access rma on rma.role_id = ar.role_id
-- where a.applicant_id is not null
-- order by a.username, rma.module_key;
