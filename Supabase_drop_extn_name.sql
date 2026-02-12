-- Supabase_drop_extn_name.sql
-- Purpose: Remove the applicants.extn_name column ("Extn"/suffix) since the app UI no longer uses it.
-- Run this in your Supabase SQL editor.

BEGIN;

ALTER TABLE public.applicants
  DROP COLUMN IF EXISTS extn_name;

COMMIT;
