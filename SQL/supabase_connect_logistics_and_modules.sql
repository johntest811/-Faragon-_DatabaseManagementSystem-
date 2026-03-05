-- Separate migration file for logistics/module connectivity.
-- Run this in Supabase SQL editor.

-- 1) Ensure Contracts exists and links to applicants
CREATE TABLE IF NOT EXISTS public.contracts (
  contract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid,
  contract_no text,
  start_date date,
  end_date date,
  status text DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_applicant_id_fkey'
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_applicant_id_fkey
      FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id);
  END IF;
END $$;

-- 2) Ensure logistics tables have linking columns
ALTER TABLE public.paraphernalia
  ADD COLUMN IF NOT EXISTS id_paraphernalia uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'paraphernalia_pkey'
  ) THEN
    ALTER TABLE public.paraphernalia
      ADD CONSTRAINT paraphernalia_pkey PRIMARY KEY (id_paraphernalia);
  END IF;
EXCEPTION WHEN invalid_table_definition THEN
  -- ignore if existing structure differs; keep migration non-breaking
  NULL;
END $$;

ALTER TABLE public.paraphernalia_inventory
  ADD COLUMN IF NOT EXISTS id_paraphernalia_inventory uuid,
  ADD COLUMN IF NOT EXISTS id_paraphernalia uuid,
  ADD COLUMN IF NOT EXISTS contract_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paraphernalia_inventory_pkey') THEN
    ALTER TABLE public.paraphernalia_inventory
      ADD CONSTRAINT paraphernalia_inventory_pkey PRIMARY KEY (id_paraphernalia_inventory);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paraphernalia_inventory_id_paraphernalia_fkey') THEN
    ALTER TABLE public.paraphernalia_inventory
      ADD CONSTRAINT paraphernalia_inventory_id_paraphernalia_fkey
      FOREIGN KEY (id_paraphernalia) REFERENCES public.paraphernalia(id_paraphernalia);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paraphernalia_inventory_contract_id_fkey') THEN
    ALTER TABLE public.paraphernalia_inventory
      ADD CONSTRAINT paraphernalia_inventory_contract_id_fkey
      FOREIGN KEY (contract_id) REFERENCES public.contracts(contract_id);
  END IF;
END $$;

ALTER TABLE public.restock
  ADD COLUMN IF NOT EXISTS id_restock uuid,
  ADD COLUMN IF NOT EXISTS id_paraphernalia uuid,
  ADD COLUMN IF NOT EXISTS id_paraphernalia_inventory uuid,
  ADD COLUMN IF NOT EXISTS contract_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restock_pkey') THEN
    ALTER TABLE public.restock
      ADD CONSTRAINT restock_pkey PRIMARY KEY (id_restock);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restock_paraphernalia_fkey') THEN
    ALTER TABLE public.restock
      ADD CONSTRAINT restock_paraphernalia_fkey
      FOREIGN KEY (id_paraphernalia) REFERENCES public.paraphernalia(id_paraphernalia);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restock_inventory_fkey') THEN
    ALTER TABLE public.restock
      ADD CONSTRAINT restock_inventory_fkey
      FOREIGN KEY (id_paraphernalia_inventory) REFERENCES public.paraphernalia_inventory(id_paraphernalia_inventory);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restock_contract_fkey') THEN
    ALTER TABLE public.restock
      ADD CONSTRAINT restock_contract_fkey
      FOREIGN KEY (contract_id) REFERENCES public.contracts(contract_id);
  END IF;
END $$;

ALTER TABLE public.resigned
  ADD COLUMN IF NOT EXISTS resigned_id uuid,
  ADD COLUMN IF NOT EXISTS applicant_id uuid,
  ADD COLUMN IF NOT EXISTS contract_id uuid,
  ADD COLUMN IF NOT EXISTS id_paraphernalia_inventory uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resigned_pkey') THEN
    ALTER TABLE public.resigned
      ADD CONSTRAINT resigned_pkey PRIMARY KEY (resigned_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resigned_applicant_id_fkey') THEN
    ALTER TABLE public.resigned
      ADD CONSTRAINT resigned_applicant_id_fkey
      FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resigned_contract_id_fkey') THEN
    ALTER TABLE public.resigned
      ADD CONSTRAINT resigned_contract_id_fkey
      FOREIGN KEY (contract_id) REFERENCES public.contracts(contract_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resigned_inventory_fkey') THEN
    ALTER TABLE public.resigned
      ADD CONSTRAINT resigned_inventory_fkey
      FOREIGN KEY (id_paraphernalia_inventory) REFERENCES public.paraphernalia_inventory(id_paraphernalia_inventory);
  END IF;
END $$;

-- 3) Connect Client / Inventory / Reports / Requests pages to module tables
INSERT INTO public.modules (module_key, display_name, path)
VALUES
  ('logistics', 'Logistics', '/Main_Modules/Logistics/'),
  ('client', 'Client', '/Main_Modules/Client/'),
  ('inventory', 'Inventory', '/Main_Modules/Inventory/'),
  ('reports', 'Reports', '/Main_Modules/Reports/'),
  ('requests', 'Requests', '/Main_Modules/Requests/')
ON CONFLICT (module_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  path = EXCLUDED.path;

-- Give admin/superadmin read-write access to logistics child modules by default.
INSERT INTO public.role_module_access (role_id, module_key, can_read, can_write)
SELECT r.role_id, m.module_key, true, true
FROM public.app_roles r
JOIN public.modules m
  ON m.module_key IN ('client', 'inventory', 'reports', 'requests', 'logistics')
WHERE r.role_name IN ('superadmin', 'admin')
ON CONFLICT (role_id, module_key) DO UPDATE
SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;

-- 4) Inventory fixed asset: per-category quantity + price fields
ALTER TABLE public.inventory_fixed_asset
  ADD COLUMN IF NOT EXISTS firearms_name text,
  ADD COLUMN IF NOT EXISTS firearms_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS firearms_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS communications_name text,
  ADD COLUMN IF NOT EXISTS communications_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS communications_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS furniture_name text,
  ADD COLUMN IF NOT EXISTS furniture_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS furniture_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS office_name text,
  ADD COLUMN IF NOT EXISTS office_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS office_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sec_name text,
  ADD COLUMN IF NOT EXISTS sec_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sec_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vehicle_name text,
  ADD COLUMN IF NOT EXISTS vehicle_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vehicle_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_updated_at timestamptz;

UPDATE public.inventory_fixed_asset
SET
  firearms_name = COALESCE(NULLIF(firearms_name, ''), NULLIF(firearms_ammunitions, '')),
  communications_name = COALESCE(NULLIF(communications_name, ''), NULLIF(communications_equipment, '')),
  furniture_name = COALESCE(NULLIF(furniture_name, ''), NULLIF(furniture_and_fixtures, '')),
  office_name = COALESCE(NULLIF(office_name, ''), NULLIF(office_equipments_sec_equipments, '')),
  sec_name = COALESCE(NULLIF(sec_name, ''), NULLIF(sec_equipments, '')),
  vehicle_name = COALESCE(NULLIF(vehicle_name, ''), NULLIF(vehicle_and_motorcycle, ''))
WHERE true;

UPDATE public.inventory_fixed_asset
SET
  total_amount =
    COALESCE(firearms_price, 0) +
    COALESCE(communications_price, 0) +
    COALESCE(furniture_price, 0) +
    COALESCE(office_price, 0) +
    COALESCE(sec_price, 0) +
    COALESCE(vehicle_price, 0)
WHERE true;
