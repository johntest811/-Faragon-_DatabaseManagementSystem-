-- Keep expiration emails running for Vercel and while Electron is closed.
--
-- Run this in the Supabase SQL Editor after notification-worker has already
-- been deployed and configured. It is safe to rerun.

begin;

update public.notification_preferences
set is_enabled = true,
    send_to_employees = true,
    use_supabase_email_sender = true,
    updated_at = now();

-- Release stale, unfinished claims so a previously interrupted delivery can
-- be retried. Successfully sent claims remain protected from duplicates.
delete from public.notification_delivery_claims
where sent_at is null
  and claimed_at < now() - interval '15 minutes';

notify pgrst, 'reload schema';

commit;

-- Optional verification:
-- select is_enabled, send_to_employees, use_supabase_email_sender,
--        days_before_expiry, use_scheduled_send, send_time_local, timezone
-- from public.notification_preferences
-- order by updated_at desc
-- limit 1;
