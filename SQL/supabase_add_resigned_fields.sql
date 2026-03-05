-- Add resigned tracking fields to applicants and allow RESIGNED status.
-- Run this in Supabase SQL editor.

BEGIN;

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS date_resigned date,
  ADD COLUMN IF NOT EXISTS last_duty text;

-- Replace the applicants status check constraint so it allows RESIGNED.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint pc
    JOIN pg_class r ON r.oid = pc.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'applicants'
      AND pc.contype = 'c'
      AND pg_get_constraintdef(pc.oid) ILIKE '%btrim(status%'
  LOOP
    EXECUTE format('ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;

  ALTER TABLE public.applicants
    ADD CONSTRAINT applicants_status_check
    CHECK (
      NULLIF(btrim(status::text), ''::text) IS NULL OR
      upper(NULLIF(btrim(status::text), ''::text)) = ANY (
        ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'REASSIGN'::text, 'RETIRED'::text, 'RESIGNED'::text]
      )
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

COMMIT;
