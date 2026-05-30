-- Supabase Data API grants for public schema objects.
--
-- Supabase is changing new projects so public schema tables/functions are not
-- exposed to PostgREST, GraphQL, or supabase-js unless API roles have explicit
-- Postgres privileges. Run this in the Supabase SQL Editor after creating or
-- updating your schema.
--
-- This script is safe to rerun. It keeps the app's current broad public-schema
-- API behavior intact. Row Level Security policies, when enabled on a table,
-- still apply after these grants.

begin;

grant usage on schema public to anon, authenticated, service_role;

-- Existing public tables used by the application.
grant all privileges on all tables in schema public to anon, authenticated, service_role;

-- Existing identity/serial sequences used by bigint/serial columns.
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Existing public RPC functions/triggers exposed through PostgREST.
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Future tables created in public by the role running this script.
alter default privileges in schema public
  grant all privileges on tables to anon, authenticated, service_role;

-- Future sequences created in public by the role running this script.
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- Future functions created in public by the role running this script.
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

commit;

-- Optional check: run this after the commit if you want to inspect public tables
-- that are still missing API-role privileges.
--
-- select
--   n.nspname as schema_name,
--   c.relname as table_name,
--   has_table_privilege('anon', c.oid, 'select') as anon_can_select,
--   has_table_privilege('authenticated', c.oid, 'select') as authenticated_can_select,
--   has_table_privilege('service_role', c.oid, 'select') as service_role_can_select
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relkind in ('r', 'p', 'v', 'm', 'f')
-- order by c.relname;
