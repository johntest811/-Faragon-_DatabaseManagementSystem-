-- Adds fine-grained personnel (employee record + column) access requests and overrides.
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

-- 1) Extend access_requests with personnel target + assigned reviewer.
alter table if exists public.access_requests
  add column if not exists request_scope_row boolean not null default false,
  add column if not exists request_scope_column boolean not null default false,
  add column if not exists requested_column_keys text[],
  add column if not exists requested_applicant_ids uuid[],
  add column if not exists requested_applicant_id uuid,
  add column if not exists requested_row_identifier_key text,
  add column if not exists requested_row_identifier_values text[],
  add column if not exists requested_row_identifier_value text,
  add column if not exists approver_admin_id uuid,
  add column if not exists approver_username text,
  add column if not exists approver_full_name text;

-- Safe FK wiring (guarded; only create if missing)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'access_requests_requested_applicant_fkey'
  ) then
    alter table public.access_requests
      add constraint access_requests_requested_applicant_fkey
      foreign key (requested_applicant_id) references public.applicants(applicant_id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'access_requests_approver_admin_fkey'
  ) then
    alter table public.access_requests
      add constraint access_requests_approver_admin_fkey
      foreign key (approver_admin_id) references public.admins(id) on delete set null;
  end if;
end $$;

create index if not exists access_requests_requested_applicant_idx
  on public.access_requests (requested_applicant_id);

create index if not exists access_requests_approver_admin_idx
  on public.access_requests (approver_admin_id);

create index if not exists access_requests_scope_idx
  on public.access_requests (request_scope_row, request_scope_column);

create index if not exists access_requests_row_identifier_idx
  on public.access_requests (requested_row_identifier_key, requested_row_identifier_value);

-- 1.1) Admin/user applicant row-level overrides (record-level grants)
create table if not exists public.admin_applicant_access_overrides (
  admin_id uuid not null,
  module_key text not null default 'employees',
  applicant_id uuid not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (admin_id, module_key, applicant_id),
  constraint admin_applicant_access_admin_fkey
    foreign key (admin_id) references public.admins(id) on delete cascade,
  constraint admin_applicant_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade,
  constraint admin_applicant_access_applicant_fkey
    foreign key (applicant_id) references public.applicants(applicant_id) on delete cascade
);

create table if not exists public.user_applicant_access_overrides (
  user_id uuid not null,
  module_key text not null default 'employees',
  applicant_id uuid not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, module_key, applicant_id),
  constraint user_applicant_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade,
  constraint user_applicant_access_applicant_fkey
    foreign key (applicant_id) references public.applicants(applicant_id) on delete cascade
);

create index if not exists admin_applicant_access_lookup_idx
  on public.admin_applicant_access_overrides (admin_id, module_key, applicant_id);

create index if not exists user_applicant_access_lookup_idx
  on public.user_applicant_access_overrides (user_id, module_key, applicant_id);

-- 1.2) Generic row-identifier + column overrides for non-employees modules
-- Examples: client.contract_no, inventory.particular, paraphernalia.names
create table if not exists public.admin_row_identifier_column_access_overrides (
  admin_id uuid not null,
  module_key text not null,
  row_identifier_key text not null,
  row_identifier_value text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (admin_id, module_key, row_identifier_key, row_identifier_value, column_key),
  constraint admin_row_identifier_col_access_admin_fkey
    foreign key (admin_id) references public.admins(id) on delete cascade,
  constraint admin_row_identifier_col_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

create table if not exists public.user_row_identifier_column_access_overrides (
  user_id uuid not null,
  module_key text not null,
  row_identifier_key text not null,
  row_identifier_value text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, module_key, row_identifier_key, row_identifier_value, column_key),
  constraint user_row_identifier_col_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

create index if not exists admin_row_identifier_col_access_lookup_idx
  on public.admin_row_identifier_column_access_overrides (admin_id, module_key, row_identifier_key, row_identifier_value);

create index if not exists user_row_identifier_col_access_lookup_idx
  on public.user_row_identifier_column_access_overrides (user_id, module_key, row_identifier_key, row_identifier_value);

-- 2) Admin (legacy login) applicant-specific column overrides.
create table if not exists public.admin_applicant_column_access_overrides (
  admin_id uuid not null,
  module_key text not null default 'employees',
  applicant_id uuid not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (admin_id, module_key, applicant_id, column_key),
  constraint admin_applicant_col_access_admin_fkey
    foreign key (admin_id) references public.admins(id) on delete cascade,
  constraint admin_applicant_col_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade,
  constraint admin_applicant_col_access_applicant_fkey
    foreign key (applicant_id) references public.applicants(applicant_id) on delete cascade
);

create index if not exists admin_applicant_col_access_lookup_idx
  on public.admin_applicant_column_access_overrides (admin_id, module_key, applicant_id);

-- 3) Supabase auth user applicant-specific column overrides.
create table if not exists public.user_applicant_column_access_overrides (
  user_id uuid not null,
  module_key text not null default 'employees',
  applicant_id uuid not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, module_key, applicant_id, column_key),
  constraint user_applicant_col_access_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade,
  constraint user_applicant_col_access_applicant_fkey
    foreign key (applicant_id) references public.applicants(applicant_id) on delete cascade
);

create index if not exists user_applicant_col_access_lookup_idx
  on public.user_applicant_column_access_overrides (user_id, module_key, applicant_id);

-- 4) updated_at trigger utility
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 5) Attach triggers safely.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_admin_applicant_col_access_updated_at'
  ) then
    create trigger trg_admin_applicant_col_access_updated_at
    before update on public.admin_applicant_column_access_overrides
    for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_user_applicant_col_access_updated_at'
  ) then
    create trigger trg_user_applicant_col_access_updated_at
    before update on public.user_applicant_column_access_overrides
    for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_admin_applicant_access_updated_at'
  ) then
    create trigger trg_admin_applicant_access_updated_at
    before update on public.admin_applicant_access_overrides
    for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_user_applicant_access_updated_at'
  ) then
    create trigger trg_user_applicant_access_updated_at
    before update on public.user_applicant_access_overrides
    for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_admin_row_identifier_col_access_updated_at'
  ) then
    create trigger trg_admin_row_identifier_col_access_updated_at
    before update on public.admin_row_identifier_column_access_overrides
    for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_user_row_identifier_col_access_updated_at'
  ) then
    create trigger trg_user_row_identifier_col_access_updated_at
    before update on public.user_row_identifier_column_access_overrides
    for each row execute function public.set_updated_at_timestamp();
  end if;
end $$;

-- NOTE:
-- This migration does not enforce new RLS policies to keep compatibility with the mixed legacy + Supabase auth model.
