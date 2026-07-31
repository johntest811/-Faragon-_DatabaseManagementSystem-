-- Fix Client contract creation when notification_recipient_email is blank.
--
-- Paste this whole file into the Supabase SQL Editor and run it once. It is
-- safe to rerun. It keeps the Client notification recipient table available,
-- allows blank legacy contract recipient values, and refreshes PostgREST's
-- schema cache.

begin;

create extension if not exists pgcrypto;

alter table if exists public.contracts
  add column if not exists notification_recipient_email text;

update public.contracts
set notification_recipient_email = null
where nullif(btrim(coalesce(notification_recipient_email, '')), '') is null;

alter table if exists public.contracts
  drop constraint if exists contracts_notification_recipient_email_check;

alter table if exists public.contracts
  add constraint contracts_notification_recipient_email_check
  check (
    notification_recipient_email is null
    or nullif(btrim(notification_recipient_email), '') is null
    or notification_recipient_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  );

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

create index if not exists contracts_status_end_notification_idx
  on public.contracts (status, contract_end, notification_recipient_email);

create index if not exists contract_notification_recipients_is_active_idx
  on public.contract_notification_recipients (is_active);

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
grant all privileges on table public.contracts to anon, authenticated, service_role;
grant all privileges on table public.contract_notification_recipients to anon, authenticated, service_role;
grant all privileges on table public.contract_expiration_notification_log to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

drop policy if exists contracts_legacy_app_access on public.contracts;

create policy contracts_legacy_app_access
  on public.contracts
  for all
  to anon, authenticated
  using (true)
  with check (true);

alter table public.contract_notification_recipients enable row level security;

drop policy if exists contract_notification_recipients_legacy_app_access
  on public.contract_notification_recipients;

create policy contract_notification_recipients_legacy_app_access
  on public.contract_notification_recipients
  for all
  to anon, authenticated
  using (true)
  with check (true);

commit;

-- Refresh Supabase/PostgREST schema cache after this migration.
notify pgrst, 'reload schema';
