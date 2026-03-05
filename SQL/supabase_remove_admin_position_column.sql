-- Remove legacy `position` column from public.admins.
-- Safe to run multiple times.

alter table if exists public.admins
  drop column if exists position;
