-- Adds Gun Safety Certificate support to existing schema.
-- Safe to run multiple times.

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS gun_safety_certificate_path text;

-- Optional: if you want quick lookup per applicant
CREATE INDEX IF NOT EXISTS certificates_gun_safety_path_idx
  ON public.certificates (gun_safety_certificate_path);
