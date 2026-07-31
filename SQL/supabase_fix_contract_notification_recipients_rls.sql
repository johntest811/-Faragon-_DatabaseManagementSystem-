-- Fix Client contract recipient inserts/updates blocked by Supabase RLS.
--
-- Paste this entire file into the Supabase SQL Editor and run it once. It is
-- safe to rerun. The application authenticates through public.admins, so its
-- browser database requests use Supabase's anon Data API role.

begin;

create table if not exists public.contract_notification_recipients (
  id bigint generated always as identity primary key,
  email text not null unique,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_notification_recipients_email_check
    check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.contract_notification_recipients
  to anon, authenticated, service_role;
grant usage, select
  on sequence public.contract_notification_recipients_id_seq
  to anon, authenticated, service_role;

alter table public.contract_notification_recipients enable row level security;

drop policy if exists contract_notification_recipients_legacy_app_access
  on public.contract_notification_recipients;

create policy contract_notification_recipients_legacy_app_access
  on public.contract_notification_recipients
  for all
  to anon, authenticated
  using (true)
  with check (true);

commit;

-- Optional verification. This should return one row with anon and
-- authenticated in the roles column and ALL in cmd.
--
-- select schemaname, tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'contract_notification_recipients'
--   and policyname = 'contract_notification_recipients_legacy_app_access';
