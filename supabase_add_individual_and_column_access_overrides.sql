-- Adds individual page/column access overrides and request-column support.
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

-- 1) Extend access_requests so users can request specific columns.
alter table if exists public.access_requests
  add column if not exists requested_column_key text;

create index if not exists access_requests_requested_column_idx
  on public.access_requests (requested_column_key);

-- 2) Admin (legacy login) individual page overrides.
create table if not exists public.admin_module_access_overrides (
  admin_id uuid not null,
  module_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (admin_id, module_key),
  constraint admin_module_access_overrides_admin_fkey
    foreign key (admin_id) references public.admins(id) on delete cascade,
  constraint admin_module_access_overrides_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

-- 3) Admin (legacy login) individual column overrides.
create table if not exists public.admin_column_access_overrides (
  admin_id uuid not null,
  module_key text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (admin_id, module_key, column_key),
  constraint admin_column_access_overrides_admin_fkey
    foreign key (admin_id) references public.admins(id) on delete cascade,
  constraint admin_column_access_overrides_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

create index if not exists admin_column_access_module_idx
  on public.admin_column_access_overrides (module_key);

-- 4) Supabase auth user individual page overrides.
create table if not exists public.user_module_access_overrides (
  user_id uuid not null,
  module_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, module_key),
  constraint user_module_access_overrides_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

-- 5) Supabase auth user individual column overrides.
create table if not exists public.user_column_access_overrides (
  user_id uuid not null,
  module_key text not null,
  column_key text not null,
  can_read boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, module_key, column_key),
  constraint user_column_access_overrides_module_fkey
    foreign key (module_key) references public.modules(module_key) on delete cascade
);

create index if not exists user_column_access_module_idx
  on public.user_column_access_overrides (module_key);

-- Optional trigger utility for updated_at.
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach/update triggers safely.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_admin_module_access_overrides_updated_at'
  ) then
    create trigger trg_admin_module_access_overrides_updated_at
    before update on public.admin_module_access_overrides
    for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_admin_column_access_overrides_updated_at'
  ) then
    create trigger trg_admin_column_access_overrides_updated_at
    before update on public.admin_column_access_overrides
    for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_user_module_access_overrides_updated_at'
  ) then
    create trigger trg_user_module_access_overrides_updated_at
    before update on public.user_module_access_overrides
    for each row execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_user_column_access_overrides_updated_at'
  ) then
    create trigger trg_user_column_access_overrides_updated_at
    before update on public.user_column_access_overrides
    for each row execute function public.set_updated_at_timestamp();
  end if;
end $$;

-- NOTE:
-- This migration intentionally does not force RLS changes to avoid breaking your current mixed auth model.
