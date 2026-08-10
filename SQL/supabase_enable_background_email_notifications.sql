-- Keep expiration emails running for Vercel and while Electron is closed.
--
-- Run this in the Supabase SQL Editor after notification-worker has already
-- been deployed and configured. It is safe to rerun.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists pg_cron;

create schema if not exists private;

create table if not exists private.notification_worker_settings (
  setting_key text primary key,
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
set search_path = private, public, net, pg_temp
as $$
declare
  worker_row private.notification_worker_settings%rowtype;
begin
  select *
  into worker_row
  from private.notification_worker_settings
  where setting_key = 'default'
  limit 1;

  if not found
     or not worker_row.is_enabled
     or nullif(btrim(worker_row.worker_url), '') is null
     or nullif(btrim(worker_row.worker_secret), '') is null then
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
    ),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on table private.notification_worker_settings from public, anon, authenticated;
revoke all on function private.trigger_notification_worker() from public, anon, authenticated;

-- Repair the delivery claim function used by both the Vercel worker and the
-- desktop sender. Naming the primary-key constraint avoids PostgreSQL 42702
-- (delivery_key could otherwise mean the output variable or table column).
create or replace function public.claim_notification_deliveries(p_deliveries jsonb)
returns table (delivery_key text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with payload as (
    select distinct
      lower(btrim(entry.delivery_key)) as delivery_key,
      lower(btrim(entry.notification_kind)) as notification_kind,
      btrim(entry.record_id) as record_id,
      upper(btrim(entry.notification_type)) as notification_type,
      entry.expires_on::date as expires_on,
      lower(btrim(entry.recipient_email)) as recipient_email
    from jsonb_to_recordset(coalesce(p_deliveries, '[]'::jsonb)) as entry(
      delivery_key text,
      notification_kind text,
      record_id text,
      notification_type text,
      expires_on text,
      recipient_email text
    )
    where nullif(btrim(entry.delivery_key), '') is not null
      and nullif(btrim(entry.record_id), '') is not null
      and nullif(btrim(entry.expires_on), '') is not null
      and lower(btrim(entry.notification_kind)) in (
        'licensure',
        'other_expiration',
        'car_insurance',
        'contract'
      )
      and lower(btrim(entry.recipient_email))
        ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  released_stale_claims as (
    delete from public.notification_delivery_claims existing
    using payload requested
    where existing.delivery_key = requested.delivery_key
      and existing.sent_at is null
      and existing.claimed_at < now() - interval '30 minutes'
    returning existing.delivery_key
  )
  insert into public.notification_delivery_claims as claims (
    delivery_key,
    notification_kind,
    record_id,
    notification_type,
    expires_on,
    recipient_email,
    claimed_at,
    sent_at,
    last_error
  )
  select
    requested.delivery_key,
    requested.notification_kind,
    requested.record_id,
    requested.notification_type,
    requested.expires_on,
    requested.recipient_email,
    now(),
    null,
    null
  from payload requested
  on conflict on constraint notification_delivery_claims_pkey do nothing
  returning claims.delivery_key;
end;
$$;

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

-- Recreate the job on every run so schedule or function changes cannot leave
-- an older inactive definition behind.
do $cron$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'notification-worker-every-minute'
  ) then
    perform cron.unschedule('notification-worker-every-minute');
  end if;

  perform cron.schedule(
    'notification-worker-every-minute',
    '* * * * *',
    $job$ select private.trigger_notification_worker(); $job$
  );
end
$cron$;

notify pgrst, 'reload schema';

commit;

-- Optional verification:
-- select is_enabled, send_to_employees, use_supabase_email_sender,
--        days_before_expiry, use_scheduled_send, send_time_local, timezone
-- from public.notification_preferences
-- order by updated_at desc
-- limit 1;
--
-- select jobid, jobname, schedule, active, command
-- from cron.job
-- where jobname = 'notification-worker-every-minute';
--
-- select status, count(*) as runs, max(end_time) as last_finished_at
-- from cron.job_run_details
-- where jobid in (
--   select jobid from cron.job
--   where jobname = 'notification-worker-every-minute'
-- )
--   and start_time >= now() - interval '30 minutes'
-- group by status
-- order by status;
