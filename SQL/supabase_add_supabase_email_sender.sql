-- Moves automated notification delivery out of the Electron app and into Supabase.
-- Run this once in the Supabase SQL editor after deploying the Edge Function.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.notification_email_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider text not null default 'gmail' check (provider = 'gmail'),
  gmail_user text not null default '',
  from_email text not null default '',
  gmail_app_password text null,
  is_active boolean not null default true,
  notes text null
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_enabled boolean not null default true,
  days_before_expiry integer not null default 30 check (days_before_expiry >= 1 and days_before_expiry <= 365),
  include_driver_license boolean not null default false,
  include_security_license boolean not null default true,
  include_insurance boolean not null default false,
  send_time_local time not null default '08:00:00',
  timezone text not null default 'Asia/Manila',
  use_scheduled_send boolean not null default true,
  send_to_employees boolean not null default true
);

alter table public.notification_preferences
  add column if not exists use_supabase_email_sender boolean not null default false;

alter table public.notification_preferences
  add column if not exists include_expired boolean not null default false;

alter table public.notification_preferences
  add column if not exists expired_within_days integer not null default 7 check (expired_within_days >= 1 and expired_within_days <= 365);

create schema if not exists private;

create table if not exists private.notification_worker_settings (
  setting_key text not null primary key,
  worker_url text not null default '',
  worker_secret text not null default encode(gen_random_bytes(32), 'hex'),
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.notification_worker_settings (setting_key)
values ('default')
on conflict (setting_key) do nothing;

create or replace function private.trigger_notification_worker()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  worker_row private.notification_worker_settings%rowtype;
begin
  select *
    into worker_row
  from private.notification_worker_settings
  where setting_key = 'default'
  limit 1;

  if not found or not worker_row.is_enabled then
    return;
  end if;

  if worker_row.worker_url is null or btrim(worker_row.worker_url) = '' then
    return;
  end if;

  perform net.http_post(
    url := worker_row.worker_url,
    body := jsonb_build_object(
      'task', 'send_notifications',
      'source', 'pg_cron'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notification-worker-secret', worker_row.worker_secret
    )
  );
end;
$$;

do $cron$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'notification-worker-every-minute'
  ) then
    perform cron.schedule(
      'notification-worker-every-minute',
      '* * * * *',
      $job$ select private.trigger_notification_worker(); $job$
    );
  end if;
end
$cron$;

commit;
