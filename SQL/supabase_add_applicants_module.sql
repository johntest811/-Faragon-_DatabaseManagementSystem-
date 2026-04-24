-- Adds the Applicant workforce module and allows APPLICANT status in applicants.status.
-- Safe to run multiple times.

BEGIN;

ALTER TABLE IF EXISTS public.role_module_access
  ADD COLUMN IF NOT EXISTS can_edit boolean NOT NULL DEFAULT false;

INSERT INTO public.modules (module_key, display_name, path)
VALUES (
  'applicants',
  'Applicant',
  '/Main_Modules/Applicants/'
)
ON CONFLICT (module_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    path = EXCLUDED.path;

INSERT INTO public.role_module_access (role_id, module_key, can_read, can_write, can_edit)
SELECT r.role_id, m.module_key, true, true, true
FROM public.app_roles r
JOIN public.modules m
  ON m.module_key = 'applicants'
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