-- Adds car registration date tracking fields to car insurance expiration records.
-- Safe to run multiple times.

BEGIN;

ALTER TABLE IF EXISTS public.other_expiration_items
  ADD COLUMN IF NOT EXISTS car_registration_from_date date,
  ADD COLUMN IF NOT EXISTS car_registration_to_date date;

CREATE INDEX IF NOT EXISTS other_expiration_items_car_registration_to_date_idx
  ON public.other_expiration_items (car_registration_to_date)
  WHERE expiration_type = 'CAR_INSURANCE';

COMMIT;
