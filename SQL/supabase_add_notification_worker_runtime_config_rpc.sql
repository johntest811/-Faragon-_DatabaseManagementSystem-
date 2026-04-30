-- Exposes the private notification worker settings to service-role callers only.
-- Run this after SQL/supabase_add_supabase_email_sender.sql.

begin;

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

create or replace function public.get_notification_worker_runtime_config(p_setting_key text default 'default')
returns table (
  setting_key text,
  worker_url text,
  worker_secret text,
  is_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  return query
  select
    s.setting_key,
    s.worker_url,
    s.worker_secret,
    s.is_enabled,
    s.updated_at
  from private.notification_worker_settings as s
  where s.setting_key = coalesce(nullif(btrim(p_setting_key), ''), 'default')
  limit 1;
end;
$$;

revoke all on function public.get_notification_worker_runtime_config(text) from public;
revoke all on function public.get_notification_worker_runtime_config(text) from anon;
revoke all on function public.get_notification_worker_runtime_config(text) from authenticated;
grant execute on function public.get_notification_worker_runtime_config(text) to service_role;

commit;
