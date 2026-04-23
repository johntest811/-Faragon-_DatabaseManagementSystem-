-- Audit log retention settings for the desktop app.
-- The Electron main process reads this row and automatically deletes audit log rows older than the selected period.

create table if not exists public.audit_log_retention_settings (
  id text not null default 'default',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  retention_days integer not null default 30 check (retention_days in (7, 30, 365)),
  constraint audit_log_retention_settings_pkey primary key (id)
);

insert into public.audit_log_retention_settings (id, retention_days)
values ('default', 30)
on conflict (id) do nothing;

create index if not exists audit_log_created_at_idx on public.audit_log using btree (created_at desc);

create or replace function public.set_audit_log_retention_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_audit_log_retention_settings_updated_at on public.audit_log_retention_settings;

create trigger trg_set_audit_log_retention_settings_updated_at
before update on public.audit_log_retention_settings
for each row
execute function public.set_audit_log_retention_settings_updated_at();