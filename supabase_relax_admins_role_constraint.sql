-- Allow assigning newly created roles to legacy admin accounts.
-- Your current schema restricts public.admins.role to (superadmin/admin/employee).
-- This migration drops that CHECK constraint.

ALTER TABLE public.admins
  DROP CONSTRAINT IF EXISTS admins_role_check;
