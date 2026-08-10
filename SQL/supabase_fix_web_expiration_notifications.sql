-- Web/Vercel expiration notification access and realtime refresh support.
--
-- Paste this file into the Supabase SQL Editor and run it once. It is safe to
-- rerun. This does not expose Gmail credentials; email delivery remains in the
-- notification-worker Edge Function under the service_role.

begin;

grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'applicants',
    'licensure',
    'notification_preferences',
    'other_expiration_items',
    'contracts',
    'notification_recipients',
    'car_insurance_notification_recipients',
    'contract_notification_recipients',
    'licensure_notification_log',
    'other_expiration_notification_log',
    'contract_expiration_notification_log'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'grant select on table public.%I to anon, authenticated, service_role',
        table_name
      );
      execute format(
        'grant insert, update, delete on table public.%I to service_role',
        table_name
      );
    end if;
  end loop;
end
$$;

-- Add source tables to Supabase Realtime when the publication is available.
-- The top navigation also polls, so notifications still refresh if a project
-- intentionally disables Realtime.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'applicants',
      'licensure',
      'notification_preferences',
      'other_expiration_items',
      'contracts',
      'notification_recipients',
      'car_insurance_notification_recipients',
      'contract_notification_recipients',
      'licensure_notification_log',
      'other_expiration_notification_log',
      'contract_expiration_notification_log'
    ]
    loop
      if to_regclass(format('public.%I', table_name)) is not null
         and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = table_name
         ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end
$$;

create index if not exists contracts_web_expiration_lookup_idx
  on public.contracts (status, contract_end)
  where contract_end is not null;

create index if not exists other_expiration_web_lookup_idx
  on public.other_expiration_items (expiration_type, is_active, expires_on)
  where is_active = true;

notify pgrst, 'reload schema';

commit;

-- Vercel/background Gmail delivery also requires:
--   1. Deploying supabase/functions/notification-worker.
--   2. Configuring GMAIL_USER, GMAIL_PASS, and optionally EMAIL_LOGO_URL as
--      Supabase Edge Function secrets.
--   3. Enabling the worker with SQL/supabase_add_supabase_email_sender.sql.
--   4. Setting notification_preferences.use_supabase_email_sender to true.
--
-- Enable the Supabase sender after the worker and secrets are configured:
-- update public.notification_preferences
-- set use_supabase_email_sender = true,
--     updated_at = now();
