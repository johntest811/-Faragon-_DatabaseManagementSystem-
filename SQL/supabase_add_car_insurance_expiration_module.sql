-- Adds the Car Insurance Expiration logistics module and its dedicated fields.
-- Safe to run multiple times.

BEGIN;

ALTER TABLE IF EXISTS public.role_module_access
  ADD COLUMN IF NOT EXISTS can_edit boolean NOT NULL DEFAULT false;

INSERT INTO public.modules (module_key, display_name, path)
VALUES (
  'car_insurance_expiration',
  'Car Insurance Expiration',
  '/Main_Modules/Logistics/CarInsuranceExpiration/'
)
ON CONFLICT (module_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    path = EXCLUDED.path;

INSERT INTO public.role_module_access (role_id, module_key, can_read, can_write, can_edit)
SELECT r.role_id, m.module_key, true, true, true
FROM public.app_roles r
JOIN public.modules m
  ON m.module_key = 'car_insurance_expiration'
WHERE r.role_name IN ('superadmin', 'admin')
ON CONFLICT (role_id, module_key) DO UPDATE
SET can_read = EXCLUDED.can_read,
    can_write = EXCLUDED.can_write,
    can_edit = EXCLUDED.can_edit;

ALTER TABLE IF EXISTS public.other_expiration_items
  ADD COLUMN IF NOT EXISTS record_no integer,
  ADD COLUMN IF NOT EXISTS patrol text,
  ADD COLUMN IF NOT EXISTS post_distributions text,
  ADD COLUMN IF NOT EXISTS make text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS plate_number text,
  ADD COLUMN IF NOT EXISTS insurance_company text,
  ADD COLUMN IF NOT EXISTS policy_from_date date;

CREATE INDEX IF NOT EXISTS other_expiration_items_expiration_type_expires_on_idx
  ON public.other_expiration_items (expiration_type, expires_on);

CREATE INDEX IF NOT EXISTS other_expiration_items_car_insurance_policy_to_date_idx
  ON public.other_expiration_items (expires_on)
  WHERE expiration_type = 'CAR_INSURANCE';

COMMIT;