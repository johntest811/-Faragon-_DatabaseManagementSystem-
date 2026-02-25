-- Allow assigning multiple applicants to a single contract.
-- Run this in Supabase SQL editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contract_employees (
  contract_id uuid NOT NULL,
  applicant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_employees_pkey PRIMARY KEY (contract_id, applicant_id),
  CONSTRAINT contract_employees_contract_id_fkey FOREIGN KEY (contract_id)
    REFERENCES public.contracts(contract_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT contract_employees_applicant_id_fkey FOREIGN KEY (applicant_id)
    REFERENCES public.applicants(applicant_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

COMMIT;
