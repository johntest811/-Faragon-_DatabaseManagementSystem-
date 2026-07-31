-- Fix Paraphernalia detachment table inserts/deletes blocked by RLS (42501).
--
-- Paste this entire file into the Supabase SQL Editor and run it once. It is
-- safe to rerun. The application authenticates through public.admins, so its
-- browser database requests use Supabase's anon Data API role.

begin;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.paraphernalia_detachment_tables
  to anon, authenticated, service_role;

alter table public.paraphernalia_detachment_tables enable row level security;

drop policy if exists paraphernalia_detachment_tables_legacy_app_access
  on public.paraphernalia_detachment_tables;

create policy paraphernalia_detachment_tables_legacy_app_access
  on public.paraphernalia_detachment_tables
  for all
  to anon, authenticated
  using (true)
  with check (true);

commit;

-- Optional verification. This should return one row containing both anon and
-- authenticated in the roles column.
-- select schemaname, tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'paraphernalia_detachment_tables'
--   and policyname = 'paraphernalia_detachment_tables_legacy_app_access';
