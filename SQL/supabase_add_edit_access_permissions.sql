-- Adds edit access flags to module permission tables and access request rows.
-- Run this against existing databases before using the updated Roles, Permissions, Requests, and Queue UI.

alter table if exists public.role_module_access
  add column if not exists can_edit boolean not null default false;

alter table if exists public.admin_module_access_overrides
  add column if not exists can_edit boolean not null default false;

alter table if exists public.user_module_access_overrides
  add column if not exists can_edit boolean not null default false;

alter table if exists public.access_requests
  add column if not exists requested_can_edit boolean not null default false;