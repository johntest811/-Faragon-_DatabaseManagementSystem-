-- Supabase_audit_log.sql
-- Purpose: Add a lightweight audit trail for admin activities.
-- Run this in your Supabase SQL editor.

BEGIN;

-- Ensure UUID generation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid NULL,
  actor_email text NULL,
  action text NOT NULL,
  page text NULL,
  entity text NULL,
  details jsonb NULL
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_user_id_idx ON public.audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log (action);

COMMIT;
