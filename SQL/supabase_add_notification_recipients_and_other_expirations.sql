-- Adds recipient list support and a separate table for other expiration categories.
-- Safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_recipients (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_recipients_is_active_idx
  ON public.notification_recipients (is_active);

CREATE TABLE IF NOT EXISTS public.other_expiration_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_name text NOT NULL,
  expiration_type text NOT NULL CHECK (expiration_type IN ('CAR_OCR', 'CAR_REGISTRATION', 'DRIVERS_LICENSE')),
  expires_on date NOT NULL,
  recipient_email text NULL,
  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS other_expiration_items_expires_on_idx
  ON public.other_expiration_items (expires_on);

CREATE INDEX IF NOT EXISTS other_expiration_items_is_active_idx
  ON public.other_expiration_items (is_active);

COMMIT;
