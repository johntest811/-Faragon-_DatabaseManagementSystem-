-- Expiring contract top-navigation access and email delivery history.
--
-- Run this in the Supabase SQL Editor before using Expiring Contracts.
-- It is safe to rerun and preserves all existing contract and notification data.

begin;

create extension if not exists pgcrypto;

alter table if exists public.contracts
  add column if not exists notification_recipient_email text;

comment on column public.contracts.notification_recipient_email is
  'Legacy per-contract recipient retained as a fallback for older application builds.';

update public.contracts
set notification_recipient_email = nullif(lower(btrim(notification_recipient_email)), '')
where notification_recipient_email is not null;

create table if not exists public.contract_notification_recipients (
  id bigint generated always as identity primary key,
  email text not null unique,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_notification_recipients_email_check
    check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

comment on table public.contract_notification_recipients is
  'Active inboxes that receive expiration reminders for every Client contract.';

create index if not exists contract_notification_recipients_is_active_idx
  on public.contract_notification_recipients (is_active);

-- This application authenticates through public.admins, so browser Data API
-- requests use Supabase's anon role. UI RBAC still controls who can manage the
-- Client recipient list.
alter table public.contract_notification_recipients enable row level security;

drop policy if exists contract_notification_recipients_legacy_app_access
  on public.contract_notification_recipients;

create policy contract_notification_recipients_legacy_app_access
  on public.contract_notification_recipients
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Preserve existing configuration by moving every valid legacy contract
-- recipient into the new module-specific list.
insert into public.contract_notification_recipients (email, is_active, notes)
select distinct
  lower(btrim(c.notification_recipient_email)),
  true,
  'Migrated from an existing Client contract'
from public.contracts c
where nullif(btrim(coalesce(c.notification_recipient_email, '')), '') is not null
  and c.notification_recipient_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
on conflict (email) do nothing;

do $$
begin
  if to_regclass('public.contracts') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'contracts_notification_recipient_email_check'
         and conrelid = 'public.contracts'::regclass
     ) then
    alter table public.contracts
      add constraint contracts_notification_recipient_email_check
      check (
        notification_recipient_email is null
        or notification_recipient_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
      );
  end if;
end
$$;

create index if not exists contracts_status_end_notification_idx
  on public.contracts (status, contract_end, notification_recipient_email);

create table if not exists public.contract_expiration_notification_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contract_id uuid,
  contract_no text,
  record_name text not null default 'Contract',
  expires_on date not null,
  recipient_email text,
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'SENT', 'FAILED', 'SKIPPED')),
  error_message text
);

alter table public.contract_expiration_notification_log
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists contract_id uuid,
  add column if not exists contract_no text,
  add column if not exists record_name text not null default 'Contract',
  add column if not exists expires_on date,
  add column if not exists recipient_email text,
  add column if not exists status text not null default 'QUEUED',
  add column if not exists error_message text;

do $$
begin
  if to_regclass('public.contracts') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'contract_expiration_notification_log_contract_id_fkey'
         and conrelid = 'public.contract_expiration_notification_log'::regclass
     ) then
    alter table public.contract_expiration_notification_log
      add constraint contract_expiration_notification_log_contract_id_fkey
      foreign key (contract_id)
      references public.contracts(contract_id)
      on update cascade
      on delete set null;
  end if;
end
$$;

create index if not exists contract_expiration_notification_log_contract_idx
  on public.contract_expiration_notification_log (contract_id, expires_on, recipient_email);

create index if not exists contract_expiration_notification_log_status_created_idx
  on public.contract_expiration_notification_log (status, created_at desc);

insert into public.modules (module_key, display_name, path)
values ('expiring_contracts', 'Expiring Contracts', '/Main_Modules/Client/')
on conflict (module_key) do update
set display_name = excluded.display_name,
    path = excluded.path;

insert into public.role_module_access (role_id, module_key, can_read, can_write, can_edit)
select r.role_id, 'expiring_contracts', true, false, false
from public.app_roles r
where lower(btrim(r.role_name)) = 'superadmin'
on conflict (role_id, module_key) do update
set can_read = excluded.can_read,
    can_write = excluded.can_write,
    can_edit = excluded.can_edit;

-- Existing roles with Client column permissions keep access to the newly
-- added recipient field. Superadmin receives it even on a fresh deployment.
do $$
begin
  if to_regclass('public.role_column_access') is not null
     and to_regclass('public.app_roles') is not null then
    execute $sql$
      with roles_to_update as (
        select distinct role_id
        from public.role_column_access
        where module_key = 'client'
        union
        select role_id
        from public.app_roles
        where lower(btrim(role_name)) = 'superadmin'
      )
      insert into public.role_column_access (role_id, module_key, column_key, can_read)
      select role_id, 'client', 'notification_recipient_email', true
      from roles_to_update
      on conflict (role_id, module_key, column_key) do nothing
    $sql$;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on table public.contracts
  to anon, authenticated, service_role;
grant all privileges on table public.contract_expiration_notification_log
  to anon, authenticated, service_role;
grant all privileges on table public.contract_notification_recipients
  to anon, authenticated, service_role;
grant usage, select on sequence public.contract_notification_recipients_id_seq
  to anon, authenticated, service_role;

commit;
