-- Allows free-text values in public.other_expiration_items.expiration_type.
-- Safe to run multiple times in Supabase SQL editor.

BEGIN;

UPDATE public.other_expiration_items
SET expiration_type = CASE
  WHEN BTRIM(expiration_type) = '' THEN 'Other'
  ELSE BTRIM(expiration_type)
END
WHERE expiration_type IS NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'other_expiration_items'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%expiration_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.other_expiration_items DROP CONSTRAINT IF EXISTS %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.other_expiration_items
  ADD CONSTRAINT other_expiration_items_expiration_type_check
  CHECK (NULLIF(BTRIM(expiration_type), '') IS NOT NULL);

COMMIT;
