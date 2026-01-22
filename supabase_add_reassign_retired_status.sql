-- Adds REASSIGN and RETIRED to applicants.status allowed values.
-- You may need to adjust the constraint name if yours differs.

-- NOTE ABOUT YOUR ERROR:
-- If you run ONLY the fragment starting at "ADD CONSTRAINT ..." you will get:
--   ERROR: 42601: syntax error at or near "ADD"
-- because ADD CONSTRAINT must be part of an ALTER TABLE statement.
-- In Supabase SQL editor, make sure you run the full ALTER TABLE statement
-- (including the "ALTER TABLE public.applicants" line), or run the whole file.

-- Helpful: list current CHECK constraints on public.applicants
-- SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
-- FROM pg_constraint c
-- JOIN pg_class t ON t.oid = c.conrelid
-- JOIN pg_namespace n ON n.oid = t.relnamespace
-- WHERE n.nspname = 'public' AND t.relname = 'applicants' AND c.contype = 'c'
-- ORDER BY c.conname;

-- IMPORTANT:
-- If you get ERROR 23514 when adding the constraint, it means EXISTING rows already
-- violate the new rule (common causes: trailing spaces like 'ACTIVE ', empty string '',
-- or legacy values like 'RE-ASSIGN', 'RETIRE', etc.).

-- 0) Inspect invalid existing values (run this first if you want to see what's wrong)
-- SELECT status, count(*)
-- FROM public.applicants
-- WHERE status IS NOT NULL
--   AND upper(btrim(status)) NOT IN ('ACTIVE','INACTIVE','REASSIGN','RETIRED')
-- GROUP BY status
-- ORDER BY count(*) DESC;

-- 0.1) Normalize whitespace/case (safe)
UPDATE public.applicants
SET status = NULLIF(upper(btrim(status)), '')
WHERE status IS NOT NULL;

-- 0.2) Map common legacy variants (optional but helpful)
UPDATE public.applicants SET status = 'REASSIGN'
WHERE status IN ('RE-ASSIGN', 'REASSIGNED', 'REASSIGNMENT');

UPDATE public.applicants SET status = 'RETIRED'
WHERE status IN ('RETIRE', 'RETIREMENT');

-- 0.3) Final cleanup: anything still invalid becomes ACTIVE (choose INACTIVE instead if you prefer)
UPDATE public.applicants
SET status = 'ACTIVE'
WHERE status IS NOT NULL
  AND upper(btrim(status)) NOT IN ('ACTIVE','INACTIVE','REASSIGN','RETIRED');

-- 1) Drop old constraint (common names)
ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_status_check;
ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_status_check1;
ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_status_chk;

-- 2) Add updated constraint
ALTER TABLE public.applicants ADD CONSTRAINT applicants_status_check
CHECK (
  NULLIF(btrim(status), '') IS NULL OR
  upper(NULLIF(btrim(status), '')) IN ('ACTIVE', 'INACTIVE', 'REASSIGN', 'RETIRED')
);

-- If you still want to add without checking existing rows immediately, you can do:
-- ALTER TABLE public.applicants ADD CONSTRAINT applicants_status_check
-- CHECK (NULLIF(btrim(status), '') IS NULL OR upper(NULLIF(btrim(status), '')) IN ('ACTIVE','INACTIVE','REASSIGN','RETIRED')) NOT VALID;
-- then later: ALTER TABLE public.applicants VALIDATE CONSTRAINT applicants_status_check;

-- Optional (robust) alternative: auto-drop whichever status CHECK constraint exists, then re-add.
-- Use this if your constraint name is different and you want a one-shot script.
--
-- DO $$
-- DECLARE
--   status_constraint text;
-- BEGIN
--   SELECT c.conname
--   INTO status_constraint
--   FROM pg_constraint c
--   JOIN pg_class t ON t.oid = c.conrelid
--   JOIN pg_namespace n ON n.oid = t.relnamespace
--   WHERE n.nspname = 'public'
--     AND t.relname = 'applicants'
--     AND c.contype = 'c'
--     AND pg_get_constraintdef(c.oid) ILIKE '%status%'
--   ORDER BY c.conname
--   LIMIT 1;
--
--   IF status_constraint IS NOT NULL THEN
--     EXECUTE format('ALTER TABLE public.applicants DROP CONSTRAINT %I', status_constraint);
--   END IF;
--
--   ALTER TABLE public.applicants ADD CONSTRAINT applicants_status_check
--   CHECK (status IS NULL OR upper(status) IN ('ACTIVE','INACTIVE','REASSIGN','RETIRED'));
-- END $$;
