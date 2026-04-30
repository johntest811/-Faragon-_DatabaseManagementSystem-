create table if not exists public.admin_login_history (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid null references public.admins(id) on delete set null,
  username text null,
  full_name text null,
  role text null,
  logged_in_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);

create index if not exists admin_login_history_admin_id_logged_in_at_idx
  on public.admin_login_history using btree (admin_id, logged_in_at desc);

create index if not exists admin_login_history_logged_in_at_idx
  on public.admin_login_history using btree (logged_in_at desc);
