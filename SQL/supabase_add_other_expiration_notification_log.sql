-- Adds notification log storage for other expiration records.
-- Run this in Supabase SQL editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.other_expiration_notification_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  other_expiration_item_id bigint not null,
  item_name text not null,
  expiration_type text not null,
  expires_on date not null,
  recipient_email text null,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SENT', 'FAILED', 'SKIPPED')),
  error_message text null,
  constraint other_expiration_notification_log_other_item_fkey
    foreign key (other_expiration_item_id)
    references public.other_expiration_items(id)
    on delete cascade
);

create index if not exists other_expiration_notification_log_created_at_idx
  on public.other_expiration_notification_log (created_at desc);

create index if not exists other_expiration_notification_log_item_idx
  on public.other_expiration_notification_log (other_expiration_item_id, expires_on);

create index if not exists other_expiration_notification_log_status_idx
  on public.other_expiration_notification_log (status);

create index if not exists other_expiration_notification_log_recipient_idx
  on public.other_expiration_notification_log (recipient_email);

commit;
