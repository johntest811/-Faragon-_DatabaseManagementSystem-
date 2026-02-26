-- Fix (optional): normalize FK constraint names used by PostgREST/Supabase embed syntax.
--
-- Your Client page now disambiguates embeds by explicitly choosing FK relationships:
--   applicants!contracts_applicant_id_fkey(...)
--   applicants!contract_employees_applicant_id_fkey(...)
--
-- If your live DB has these foreign keys but with different constraint names,
-- run this script to rename them to match the names referenced above.
--
-- Safe behavior:
-- - If the expected FK exists under a different name, it will be renamed.
-- - If it doesn't exist, nothing is added (to avoid creating duplicate FKs).

BEGIN;

DO $$
DECLARE
  existing_name text;
BEGIN
  -- contracts(applicant_id) -> applicants(applicant_id)
  SELECT pc.conname INTO existing_name
  FROM pg_constraint pc
  JOIN pg_class rel ON rel.oid = pc.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE pc.contype = 'f'
    AND n.nspname = 'public'
    AND rel.relname = 'contracts'
    AND pc.confrelid = 'public.applicants'::regclass
    AND (
      SELECT array_agg(att.attname ORDER BY att.attnum)
      FROM pg_attribute att
      WHERE att.attrelid = rel.oid
        AND att.attnum = ANY (pc.conkey)
    ) = ARRAY['applicant_id']
    AND (
      SELECT array_agg(att2.attname ORDER BY att2.attnum)
      FROM pg_attribute att2
      WHERE att2.attrelid = pc.confrelid
        AND att2.attnum = ANY (pc.confkey)
    ) = ARRAY['applicant_id']
  LIMIT 1;

  IF existing_name IS NOT NULL AND existing_name <> 'contracts_applicant_id_fkey' THEN
    EXECUTE format('ALTER TABLE public.contracts RENAME CONSTRAINT %I TO contracts_applicant_id_fkey', existing_name);
  END IF;
END $$;

DO $$
DECLARE
  existing_name text;
BEGIN
  -- contract_employees(applicant_id) -> applicants(applicant_id)
  SELECT pc.conname INTO existing_name
  FROM pg_constraint pc
  JOIN pg_class rel ON rel.oid = pc.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE pc.contype = 'f'
    AND n.nspname = 'public'
    AND rel.relname = 'contract_employees'
    AND pc.confrelid = 'public.applicants'::regclass
    AND (
      SELECT array_agg(att.attname ORDER BY att.attnum)
      FROM pg_attribute att
      WHERE att.attrelid = rel.oid
        AND att.attnum = ANY (pc.conkey)
    ) = ARRAY['applicant_id']
    AND (
      SELECT array_agg(att2.attname ORDER BY att2.attnum)
      FROM pg_attribute att2
      WHERE att2.attrelid = pc.confrelid
        AND att2.attnum = ANY (pc.confkey)
    ) = ARRAY['applicant_id']
  LIMIT 1;

  IF existing_name IS NOT NULL AND existing_name <> 'contract_employees_applicant_id_fkey' THEN
    EXECUTE format(
      'ALTER TABLE public.contract_employees RENAME CONSTRAINT %I TO contract_employees_applicant_id_fkey',
      existing_name
    );
  END IF;
END $$;

COMMIT;
