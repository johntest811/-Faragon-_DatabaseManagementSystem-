-- Store the display name of the acting account on audit rows.
-- The desktop app will send this value for navigation and admin actions.

alter table public.audit_log
  add column if not exists actor_name text;

comment on column public.audit_log.actor_name is 'Display name of the account that created the audit event.';