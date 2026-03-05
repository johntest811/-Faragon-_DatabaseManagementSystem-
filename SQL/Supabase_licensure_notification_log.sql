-- Supabase_licensure_notification_log.sql
-- Purpose: Track each Gmail notification send attempt per applicant + license type.
-- This enables: (1) preventing duplicate sends, (2) showing "sent already" + count,
-- and (3) allowing admins to resend and see how many times it was sent.
--
-- Run this in your Supabase SQL editor.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.licensure_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  applicant_id uuid NOT NULL,
  license_type text NOT NULL,
  expires_on date NOT NULL,
  recipient_email text NULL,
  status text NOT NULL CHECK (status IN ('SENT', 'FAILED', 'SKIPPED')),
  error_message text NULL
);

CREATE INDEX IF NOT EXISTS licensure_notification_log_created_at_idx
  ON public.licensure_notification_log (created_at DESC);

CREATE INDEX IF NOT EXISTS licensure_notification_log_applicant_idx
  ON public.licensure_notification_log (applicant_id);

CREATE INDEX IF NOT EXISTS licensure_notification_log_item_idx
  ON public.licensure_notification_log (applicant_id, license_type, expires_on);

CREATE INDEX IF NOT EXISTS licensure_notification_log_status_idx
  ON public.licensure_notification_log (status);

COMMIT;
