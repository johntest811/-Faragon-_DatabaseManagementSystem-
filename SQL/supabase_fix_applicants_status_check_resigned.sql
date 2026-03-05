-- Fix: allow RESIGNED in applicants.status
-- Run this in Supabase SQL Editor.

BEGIN;

-- Drop the existing check constraint (Supabase commonly names it applicants_status_check)
ALTER TABLE public.applicants
  DROP CONSTRAINT IF EXISTS applicants_status_check;

-- Recreate it including RESIGNED
ALTER TABLE public.applicants
  ADD CONSTRAINT applicants_status_check
  CHECK (
    NULLIF(btrim(status::text), ''::text) IS NULL OR
    upper(NULLIF(btrim(status::text), ''::text)) = ANY (
      ARRAY[
        'ACTIVE'::text,
        'INACTIVE'::text,
        'REASSIGN'::text,
        'RETIRED'::text,
        'RESIGNED'::text
      ]
    )
  );

COMMIT;
