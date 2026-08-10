-- Floating workforce status, Southern Luzon cluster rename, and atomic email deduplication.
--
-- Paste this entire file into the Supabase SQL Editor and run it once before
-- deploying the matching application build. It is safe to rerun.

begin;

-- Add FLOATING without depending on the historical name of the status check.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_info.conname
    from pg_constraint constraint_info
    join pg_class relation_info on relation_info.oid = constraint_info.conrelid
    join pg_namespace namespace_info on namespace_info.oid = relation_info.relnamespace
    where namespace_info.nspname = 'public'
      and relation_info.relname = 'applicants'
      and constraint_info.contype = 'c'
      and lower(pg_get_constraintdef(constraint_info.oid)) like '%status%'
  loop
    execute format('alter table public.applicants drop constraint if exists %I', constraint_row.conname);
  end loop;
end
$$;

update public.applicants
set status = upper(btrim(status))
where status is not null
  and status is distinct from upper(btrim(status));

alter table public.applicants
  add constraint applicants_status_check
  check (
    nullif(btrim(status::text), '') is null
    or upper(nullif(btrim(status::text), '')) = any (
      array[
        'ACTIVE'::text,
        'INACTIVE'::text,
        'APPLICANT'::text,
        'AWOL'::text,
        'RETIRED'::text,
        'RESIGNED'::text,
        'FLOATING'::text
      ]
    )
  );

insert into public.modules (module_key, display_name, path)
values ('floating', 'Floating', '/Main_Modules/Floating/')
on conflict (module_key) do update
set display_name = excluded.display_name,
    path = excluded.path;

insert into public.role_module_access (role_id, module_key, can_read, can_write, can_edit)
select role_id, 'floating', true, true, true
from public.app_roles
where lower(btrim(role_name)) = 'superadmin'
on conflict (role_id, module_key) do update
set can_read = true,
    can_write = true,
    can_edit = true;

insert into public.role_column_access (role_id, module_key, column_key, can_read)
select role_id, 'floating', column_key, true
from public.app_roles
cross join (
  values
    ('applicant_id'),
    ('custom_id'),
    ('first_name'),
    ('last_name'),
    ('client_position'),
    ('detachment'),
    ('date_hired_fsai'),
    ('status')
) as floating_columns(column_key)
where lower(btrim(role_name)) = 'superadmin'
on conflict (role_id, module_key, column_key) do update
set can_read = true,
    updated_at = now();

-- Rename existing cluster data while accepting old imports in the UI.
update public.contracts
set cluster = 'Southern Luzon'
where lower(regexp_replace(btrim(coalesce(cluster, '')), '^3[[:space:]]+', '')) = 'southern visayas';

-- Normalize recipient addresses and remove case/whitespace-only duplicates.
update public.notification_recipients
set email = lower(btrim(email)),
    updated_at = now()
where email is distinct from lower(btrim(email));

delete from public.notification_recipients duplicate
using public.notification_recipients retained
where duplicate.id > retained.id
  and lower(btrim(duplicate.email)) = lower(btrim(retained.email));

update public.car_insurance_notification_recipients
set email = lower(btrim(email)),
    updated_at = now()
where email is distinct from lower(btrim(email));

delete from public.car_insurance_notification_recipients duplicate
using public.car_insurance_notification_recipients retained
where duplicate.id > retained.id
  and lower(btrim(duplicate.email)) = lower(btrim(retained.email));

update public.contract_notification_recipients
set email = lower(btrim(email)),
    updated_at = now()
where email is distinct from lower(btrim(email));

delete from public.contract_notification_recipients duplicate
using public.contract_notification_recipients retained
where duplicate.id > retained.id
  and lower(btrim(duplicate.email)) = lower(btrim(retained.email));

create unique index if not exists notification_recipients_normalized_email_uidx
  on public.notification_recipients (lower(btrim(email)));

create unique index if not exists car_insurance_recipients_normalized_email_uidx
  on public.car_insurance_notification_recipients (lower(btrim(email)));

create unique index if not exists contract_recipients_normalized_email_uidx
  on public.contract_notification_recipients (lower(btrim(email)));

-- A delivery claim is created before SMTP is called. The primary key makes
-- concurrent desktop/Edge workers mutually exclusive for the same reminder.
create table if not exists public.notification_delivery_claims (
  delivery_key text primary key,
  notification_kind text not null
    check (notification_kind in ('licensure', 'other_expiration', 'car_insurance', 'contract')),
  record_id text not null,
  notification_type text not null,
  expires_on date not null,
  recipient_email text not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  check (nullif(btrim(delivery_key), '') is not null),
  check (nullif(btrim(record_id), '') is not null),
  check (recipient_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

create index if not exists notification_delivery_claims_claimed_idx
  on public.notification_delivery_claims (claimed_at)
  where sent_at is null;

create index if not exists notification_delivery_claims_sent_idx
  on public.notification_delivery_claims (sent_at desc)
  where sent_at is not null;

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
      and lower(btrim(entry.notification_kind)) in ('licensure', 'other_expiration', 'car_insurance', 'contract')
      and lower(btrim(entry.recipient_email)) ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
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

create or replace function public.complete_notification_deliveries(
  p_delivery_keys text[],
  p_sent boolean,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(array_length(p_delivery_keys, 1), 0) = 0 then
    return;
  end if;

  if p_sent then
    update public.notification_delivery_claims
    set sent_at = now(),
        last_error = null
    where delivery_key = any (p_delivery_keys);
  else
    delete from public.notification_delivery_claims
    where delivery_key = any (p_delivery_keys)
      and sent_at is null;
  end if;
end;
$$;

-- Seed claims from existing SENT history so installing this migration does
-- not resend reminders that were already delivered.
insert into public.notification_delivery_claims (
  delivery_key, notification_kind, record_id, notification_type, expires_on,
  recipient_email, claimed_at, sent_at
)
select distinct on (
  lower(concat_ws('|', 'licensure', applicant_id::text, license_type, expires_on::text, lower(btrim(recipient_email))))
)
  lower(concat_ws('|', 'licensure', applicant_id::text, license_type, expires_on::text, lower(btrim(recipient_email)))),
  'licensure', applicant_id::text, upper(license_type), expires_on,
  lower(btrim(recipient_email)), created_at, created_at
from public.licensure_notification_log
where status = 'SENT'
  and nullif(btrim(coalesce(recipient_email, '')), '') is not null
order by
  lower(concat_ws('|', 'licensure', applicant_id::text, license_type, expires_on::text, lower(btrim(recipient_email)))),
  created_at
on conflict (delivery_key) do nothing;

insert into public.notification_delivery_claims (
  delivery_key, notification_kind, record_id, notification_type, expires_on,
  recipient_email, claimed_at, sent_at
)
select distinct on (delivery_key)
  delivery_key, notification_kind, record_id, notification_type, expires_on,
  recipient_email, created_at, created_at
from (
  select
    lower(concat_ws(
      '|',
      case
        when upper(expiration_type) = 'CAR_INSURANCE' or upper(expiration_type) like 'CAR_INSURANCE_%'
          then 'car_insurance'
        else 'other_expiration'
      end,
      other_expiration_item_id::text,
      expiration_type,
      expires_on::text,
      lower(btrim(recipient_email))
    )) as delivery_key,
    case
      when upper(expiration_type) = 'CAR_INSURANCE' or upper(expiration_type) like 'CAR_INSURANCE_%'
        then 'car_insurance'
      else 'other_expiration'
    end as notification_kind,
    other_expiration_item_id::text as record_id,
    upper(expiration_type) as notification_type,
    expires_on,
    lower(btrim(recipient_email)) as recipient_email,
    created_at
  from public.other_expiration_notification_log
  where status = 'SENT'
    and nullif(btrim(coalesce(recipient_email, '')), '') is not null
) existing_other
order by delivery_key, created_at
on conflict (delivery_key) do nothing;

insert into public.notification_delivery_claims (
  delivery_key, notification_kind, record_id, notification_type, expires_on,
  recipient_email, claimed_at, sent_at
)
select distinct on (
  lower(concat_ws('|', 'contract', contract_id::text, 'CONTRACT_EXPIRATION', expires_on::text, lower(btrim(recipient_email))))
)
  lower(concat_ws('|', 'contract', contract_id::text, 'CONTRACT_EXPIRATION', expires_on::text, lower(btrim(recipient_email)))),
  'contract', contract_id::text, 'CONTRACT_EXPIRATION', expires_on,
  lower(btrim(recipient_email)), created_at, created_at
from public.contract_expiration_notification_log
where status = 'SENT'
  and contract_id is not null
  and nullif(btrim(coalesce(recipient_email, '')), '') is not null
order by
  lower(concat_ws('|', 'contract', contract_id::text, 'CONTRACT_EXPIRATION', expires_on::text, lower(btrim(recipient_email)))),
  created_at
on conflict (delivery_key) do nothing;

-- Safe performance indexes for the page/status and notification lookups.
create index if not exists applicants_status_visible_idx
  on public.applicants (status, created_at desc)
  where is_archived = false and is_trashed = false;

create index if not exists contracts_cluster_status_end_idx
  on public.contracts (cluster, status, contract_end);

create index if not exists licensure_notification_sent_lookup_idx
  on public.licensure_notification_log (applicant_id, license_type, expires_on, lower(btrim(recipient_email)))
  where status = 'SENT';

create index if not exists other_expiration_notification_sent_lookup_idx
  on public.other_expiration_notification_log (other_expiration_item_id, expiration_type, expires_on, lower(btrim(recipient_email)))
  where status = 'SENT';

create index if not exists contract_notification_sent_lookup_idx
  on public.contract_expiration_notification_log (contract_id, expires_on, lower(btrim(recipient_email)))
  where status = 'SENT';

-- Claims contain delivery coordination data and are server-only.
alter table public.notification_delivery_claims enable row level security;
revoke all on table public.notification_delivery_claims from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_delivery_claims to service_role;

revoke all on function public.claim_notification_deliveries(jsonb) from public, anon, authenticated;
revoke all on function public.complete_notification_deliveries(text[], boolean, text) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(jsonb) to service_role;
grant execute on function public.complete_notification_deliveries(text[], boolean, text) to service_role;

notify pgrst, 'reload schema';

commit;

-- Non-destructive unused-table audit. Run this separately after the migration.
-- A low scan count does not prove a table is unused; Electron, Edge Functions,
-- triggers, foreign keys, and recent statistics resets can hide real usage.
-- Review the result over at least 30 days before dropping anything.
--
-- select
--   stats.relname as table_name,
--   pg_size_pretty(pg_total_relation_size(format('%I.%I', stats.schemaname, stats.relname)::regclass)) as total_size,
--   stats.seq_scan,
--   stats.idx_scan,
--   stats.n_live_tup,
--   stats.last_seq_scan,
--   stats.last_idx_scan,
--   exists (
--     select 1
--     from pg_constraint dependency
--     where dependency.confrelid = format('%I.%I', stats.schemaname, stats.relname)::regclass
--        or dependency.conrelid = format('%I.%I', stats.schemaname, stats.relname)::regclass
--   ) as has_constraint_dependency
-- from pg_stat_user_tables stats
-- where stats.schemaname = 'public'
-- order by coalesce(stats.seq_scan, 0) + coalesce(stats.idx_scan, 0), stats.relname;
