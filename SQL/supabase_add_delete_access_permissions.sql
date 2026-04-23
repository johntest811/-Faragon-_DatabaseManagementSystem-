-- Adds delete/write access flags to module override tables.
-- Run this after the existing access-override migrations.

alter table if exists public.admin_module_access_overrides
  add column if not exists can_write boolean not null default false;

alter table if exists public.user_module_access_overrides
  add column if not exists can_write boolean not null default false;