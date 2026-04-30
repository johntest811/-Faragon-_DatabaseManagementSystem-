-- Notification log retention settings for the desktop app.
-- The Electron main process reads this row and automatically deletes
-- licensure_notification_log and other_expiration_notification_log rows
-- older than the selected period.

create table if not exists public.notification_log_retention_settings (
  id text not null default 'default',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  retention_days integer not null default 30 check (retention_days in (7, 30, 365)),
  constraint notification_log_retention_settings_pkey primary key (id)
);

insert into public.notification_log_retention_settings (id, retention_days)
values ('default', 30)
on conflict (id) do nothing;

create or replace function public.set_notification_log_retention_settings_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_notification_log_retention_settings_updated_at on public.notification_log_retention_settings;

create trigger trg_set_notification_log_retention_settings_updated_at
before update on public.notification_log_retention_settings
for each row
execute function public.set_notification_log_retention_settings_updated_at();
