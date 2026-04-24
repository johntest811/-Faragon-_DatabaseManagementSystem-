-- Backfill Applicant / Car Insurance module visibility and employee edit access.
-- Safe to run multiple times on an existing database.

BEGIN;

ALTER TABLE IF EXISTS public.role_module_access
  ADD COLUMN IF NOT EXISTS can_edit boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.admin_module_access_overrides
  ADD COLUMN IF NOT EXISTS can_edit boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.user_module_access_overrides
  ADD COLUMN IF NOT EXISTS can_edit boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.access_requests
  ADD COLUMN IF NOT EXISTS requested_can_edit boolean NOT NULL DEFAULT false;

INSERT INTO public.modules (module_key, display_name, path)
VALUES
  ('applicants', 'Applicant', '/Main_Modules/Applicants/'),
  ('car_insurance_expiration', 'Car Insurance Expiration', '/Main_Modules/Logistics/CarInsuranceExpiration/')
ON CONFLICT (module_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    path = EXCLUDED.path;

-- Keep employee edit access separate from delete access.
UPDATE public.role_module_access rma
SET can_edit = true
FROM public.app_roles r
WHERE r.role_id = rma.role_id
  AND r.role_name IN ('superadmin', 'admin')
  AND rma.module_key = 'employees';

INSERT INTO public.role_module_access (role_id, module_key, can_read, can_write, can_edit)
SELECT r.role_id, m.module_key, true, true, true
FROM public.app_roles r
JOIN public.modules m
  ON m.module_key IN ('applicants', 'car_insurance_expiration')
WHERE r.role_name IN ('superadmin', 'admin')
ON CONFLICT (role_id, module_key) DO UPDATE
SET can_read = EXCLUDED.can_read,
    can_write = EXCLUDED.can_write,
    can_edit = EXCLUDED.can_edit;

ALTER TABLE public.applicants
  DROP CONSTRAINT IF EXISTS applicants_status_check;

ALTER TABLE public.applicants
  ADD CONSTRAINT applicants_status_check
  CHECK (
    NULLIF(btrim(status::text), ''::text) IS NULL OR
    upper(NULLIF(btrim(status::text), ''::text)) = ANY (
      ARRAY[
        'ACTIVE'::text,
        'APPLICANT'::text,
        'INACTIVE'::text,
        'REASSIGN'::text,
        'RETIRED'::text,
        'RESIGNED'::text
      ]
    )
  );

COMMIT;
