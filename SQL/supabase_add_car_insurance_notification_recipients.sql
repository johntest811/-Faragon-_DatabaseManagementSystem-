-- Adds a dedicated recipient list for Car Insurance Expiration reminders.
-- Safe to run multiple times.

begin;

create table if not exists public.car_insurance_notification_recipients (
  id bigint generated always as identity primary key,
  email text not null unique,
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists car_insurance_notification_recipients_is_active_idx
  on public.car_insurance_notification_recipients (is_active);

commit;
