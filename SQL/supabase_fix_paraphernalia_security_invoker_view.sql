-- Fix Supabase Security Advisor warning 0010 for the FARAGON inventory view.
--
-- Paste this entire file into the Supabase SQL Editor and run it once. It is
-- safe to rerun and does not delete or change inventory records.

begin;

-- security_invoker makes the view use the caller's permissions and apply RLS
-- from the underlying tables instead of using the view owner's privileges.
alter view public.vw_paraphernalia_main_inventory
  set (security_invoker = true);

-- The earlier Paraphernalia summary migration creates another public view.
-- Harden it too when it exists so a later Security Advisor scan does not
-- report the same issue for that view.
alter view if exists public.vw_paraphernalia_inventory_summary
  set (security_invoker = true);

-- The invoker must have SELECT privileges on every relation used by the view.
-- Existing RLS policies, when enabled, still control which rows are returned.
grant select on table
  public.restock,
  public.paraphernalia,
  public.contracts,
  public.paraphernalia_items
to anon, authenticated, service_role;

grant select on table public.vw_paraphernalia_main_inventory
  to anon, authenticated, service_role;

-- This SECURITY DEFINER function is trigger-only. Prevent direct Data API
-- execution while keeping the existing Applicants trigger operational.
do $$
begin
  if to_regprocedure('public.sync_linked_admin_from_applicant()') is not null then
    revoke all on function public.sync_linked_admin_from_applicant()
      from public, anon, authenticated;
  end if;
end
$$;

commit;

-- Optional verification. security_invoker=true should appear in reloptions
-- for every returned view.
--
-- select
--   n.nspname as schema_name,
--   c.relname as view_name,
--   c.reloptions
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname in (
--     'vw_paraphernalia_main_inventory',
--     'vw_paraphernalia_inventory_summary'
--   )
-- order by c.relname;
