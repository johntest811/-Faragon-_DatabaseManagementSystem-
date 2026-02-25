-- Contracts table restructure (run in Supabase SQL editor)
-- Adds the requested columns without dropping legacy columns.
-- After verifying the app + data migration, you can optionally drop old columns.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_no_date date,
  ADD COLUMN IF NOT EXISTS cluster text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS specific_area text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS contract_start date,
  ADD COLUMN IF NOT EXISTS contract_end date,
  ADD COLUMN IF NOT EXISTS contracted_manpower integer,
  ADD COLUMN IF NOT EXISTS deployed_guards integer,
  ADD COLUMN IF NOT EXISTS remarks text;

-- Optional (ONLY after you migrate data + confirm no dependencies):
-- ALTER TABLE public.contracts
--   DROP COLUMN IF EXISTS applicant_id,
--   DROP COLUMN IF EXISTS contract_no,
--   DROP COLUMN IF EXISTS start_date,
--   DROP COLUMN IF EXISTS end_date;
