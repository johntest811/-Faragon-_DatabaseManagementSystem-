-- Adds a toggle to disable sending expiring-license emails to employees (applicants.client_email).
-- When disabled, notifications will only be sent to configured Notification Recipients.

alter table public.notification_preferences
  add column if not exists send_to_employees boolean not null default true;

comment on column public.notification_preferences.send_to_employees is
  'When false, do not send expiring-license emails to applicants.client_email. Use notification_recipients instead.';
