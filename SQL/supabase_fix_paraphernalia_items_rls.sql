-- Fix Manage Paraphernalia Items inserts/updates blocked by RLS (error 42501).
--
-- Paste this entire file into the Supabase SQL Editor and run it once. It is
-- safe to rerun. The application currently authenticates with public.admins,
-- so browser database requests use Supabase's anon Data API role.

begin;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.paraphernalia_items
  to anon, authenticated, service_role;

alter table public.paraphernalia_items enable row level security;

drop policy if exists paraphernalia_items_legacy_app_access
  on public.paraphernalia_items;

create policy paraphernalia_items_legacy_app_access
  on public.paraphernalia_items
  for all
  to anon, authenticated
  using (true)
  with check (true);

commit;

-- Optional verification. This should return one row containing both anon and
-- authenticated in the roles column.
--
-- select schemaname, tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'paraphernalia_items'
--   and policyname = 'paraphernalia_items_legacy_app_access';
