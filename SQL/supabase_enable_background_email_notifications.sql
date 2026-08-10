-- Keep expiration emails running for Vercel and while Electron is closed.
--
-- Run this in the Supabase SQL Editor after notification-worker has already
-- been deployed and configured. It is safe to rerun.

begin;

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

notify pgrst, 'reload schema';

commit;

-- Optional verification:
-- select is_enabled, send_to_employees, use_supabase_email_sender,
--        days_before_expiry, use_scheduled_send, send_time_local, timezone
-- from public.notification_preferences
-- order by updated_at desc
-- limit 1;
