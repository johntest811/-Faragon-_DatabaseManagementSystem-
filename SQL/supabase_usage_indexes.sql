-- Optional targeted indexes for the queries already used by the application.
-- Run diagnostics first. Reuses index names from earlier migrations to avoid
-- duplicating them. No data deletion, broad grants, RLS or cron changes.
-- Run during a quiet period: index construction briefly blocks table writes.
-- If a timeout occurs, the transaction rolls back; retry later, not in a loop.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);

create index if not exists applicants_status_visible_idx
  on public.applicants (status, created_at desc)
  where is_archived = false and is_trashed = false;

create index if not exists licensure_notification_sent_lookup_idx
  on public.licensure_notification_log (applicant_id, license_type, expires_on, lower(btrim(recipient_email)))
  where status = 'SENT';

create index if not exists other_expiration_notification_sent_lookup_idx
  on public.other_expiration_notification_log (other_expiration_item_id, expiration_type, expires_on, lower(btrim(recipient_email)))
  where status = 'SENT';

create index if not exists contract_notification_sent_lookup_idx
  on public.contract_expiration_notification_log (contract_id, expires_on, lower(btrim(recipient_email)))
  where status = 'SENT';

commit;
