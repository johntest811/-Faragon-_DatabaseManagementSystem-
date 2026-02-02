-- supabase_linked_inventory.sql
-- Purpose: Connect restock, paraphernalia, paraphernalia_inventory, resigned, and contracts
--          via proper primary keys + foreign keys, and provide a unified view.
--
-- Safe to run multiple times: uses IF EXISTS / IF NOT EXISTS and duplicate_object guards.

BEGIN;

-- Supabase typically has pgcrypto enabled, but keep it safe.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0) Ensure the base tables exist.
-- Your schema dump includes these tables, but your Supabase project may not have them yet.
-- We create them with the columns you showed, plus safe defaults where appropriate.

CREATE TABLE IF NOT EXISTS public.paraphernalia_inventory (
  id_paraphernalia_inventory uuid NOT NULL DEFAULT gen_random_uuid(),
  items text,
  stock_balance numeric,
  stock_in numeric,
  stock_out numeric
);

CREATE TABLE IF NOT EXISTS public.paraphernalia (
  id_paraphernalia uuid NOT NULL DEFAULT gen_random_uuid(),
  names text,
  items character varying,
  quantity integer,
  price numeric,
  date character varying,
  "timestamp" timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.restock (
  id_restock uuid NOT NULL DEFAULT gen_random_uuid(),
  date character varying,
  status text,
  item text,
  quanitity character varying,
  timestamptz timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resigned (
  last_name character varying,
  first_name character varying,
  middle_name character varying,
  date_resigned character varying,
  detachment character varying,
  remarks text,
  last_duty character varying,
  "timestamp" timestamp without time zone NOT NULL DEFAULT now()
);

-- 1) Canonical item table to connect inventory/restock/paraphernalia.
CREATE TABLE IF NOT EXISTS public.paraphernalia_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paraphernalia_items_item_name_uniq UNIQUE (item_name)
);

-- 2) Contracts table (not present in your schema dump).
-- Links to applicants so it fits your existing UUID-based identity model.
CREATE TABLE IF NOT EXISTS public.contracts (
  contract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NULL,
  employee_number text,
  full_name text,
  detachment text,
  position text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status = ANY (ARRAY['ACTIVE','ENDED','CANCELLED'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contracts_applicant_id_fkey FOREIGN KEY (applicant_id)
    REFERENCES public.applicants(applicant_id)
    ON UPDATE CASCADE ON DELETE SET NULL
);

-- 3) Ensure base tables have primary keys and add linking columns.

-- 3a) paraphernalia_inventory
ALTER TABLE IF EXISTS public.paraphernalia_inventory
  ADD COLUMN IF NOT EXISTS item_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF to_regclass('public.paraphernalia_inventory') IS NOT NULL THEN
    ALTER TABLE public.paraphernalia_inventory
      ADD CONSTRAINT paraphernalia_inventory_pkey PRIMARY KEY (id_paraphernalia_inventory);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.paraphernalia_inventory') IS NOT NULL THEN
    ALTER TABLE public.paraphernalia_inventory
      ADD CONSTRAINT paraphernalia_inventory_item_id_fkey FOREIGN KEY (item_id)
      REFERENCES public.paraphernalia_items(item_id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3b) paraphernalia (treat as transactions/issues)
ALTER TABLE IF EXISTS public.paraphernalia
  ADD COLUMN IF NOT EXISTS item_id uuid,
  ADD COLUMN IF NOT EXISTS inventory_id uuid,
  ADD COLUMN IF NOT EXISTS contract_id uuid,
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'ISSUE'
    CHECK (action = ANY (ARRAY['ISSUE','RETURN','ADJUSTMENT']));

DO $$
BEGIN
  IF to_regclass('public.paraphernalia') IS NOT NULL THEN
    ALTER TABLE public.paraphernalia
      ADD CONSTRAINT paraphernalia_pkey PRIMARY KEY (id_paraphernalia);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.paraphernalia') IS NOT NULL THEN
    ALTER TABLE public.paraphernalia
      ADD CONSTRAINT paraphernalia_item_id_fkey FOREIGN KEY (item_id)
      REFERENCES public.paraphernalia_items(item_id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.paraphernalia') IS NOT NULL THEN
    ALTER TABLE public.paraphernalia
      ADD CONSTRAINT paraphernalia_inventory_id_fkey FOREIGN KEY (inventory_id)
      REFERENCES public.paraphernalia_inventory(id_paraphernalia_inventory)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.paraphernalia') IS NOT NULL THEN
    ALTER TABLE public.paraphernalia
      ADD CONSTRAINT paraphernalia_contract_id_fkey FOREIGN KEY (contract_id)
      REFERENCES public.contracts(contract_id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3c) restock
ALTER TABLE IF EXISTS public.restock
  ADD COLUMN IF NOT EXISTS item_id uuid,
  ADD COLUMN IF NOT EXISTS inventory_id uuid,
  ADD COLUMN IF NOT EXISTS contract_id uuid,
  -- Keep your existing misspelled "quanitity" column for compatibility;
  -- add a numeric "quantity" column to use going forward.
  ADD COLUMN IF NOT EXISTS quantity numeric;

DO $$
BEGIN
  IF to_regclass('public.restock') IS NOT NULL THEN
    ALTER TABLE public.restock
      ADD CONSTRAINT restock_pkey PRIMARY KEY (id_restock);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.restock') IS NOT NULL THEN
    ALTER TABLE public.restock
      ADD CONSTRAINT restock_item_id_fkey FOREIGN KEY (item_id)
      REFERENCES public.paraphernalia_items(item_id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.restock') IS NOT NULL THEN
    ALTER TABLE public.restock
      ADD CONSTRAINT restock_inventory_id_fkey FOREIGN KEY (inventory_id)
      REFERENCES public.paraphernalia_inventory(id_paraphernalia_inventory)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.restock') IS NOT NULL THEN
    ALTER TABLE public.restock
      ADD CONSTRAINT restock_contract_id_fkey FOREIGN KEY (contract_id)
      REFERENCES public.contracts(contract_id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3d) resigned
ALTER TABLE IF EXISTS public.resigned
  ADD COLUMN IF NOT EXISTS resigned_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS applicant_id uuid,
  ADD COLUMN IF NOT EXISTS contract_id uuid,
  ADD COLUMN IF NOT EXISTS resigned_at timestamptz NOT NULL DEFAULT now();

-- Backfill IDs if the table already had rows.
DO $$
BEGIN
  IF to_regclass('public.resigned') IS NOT NULL THEN
    UPDATE public.resigned
    SET resigned_id = gen_random_uuid()
    WHERE resigned_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.resigned
  ALTER COLUMN resigned_id SET NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.resigned') IS NOT NULL THEN
    ALTER TABLE public.resigned
      ADD CONSTRAINT resigned_pkey PRIMARY KEY (resigned_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.resigned') IS NOT NULL THEN
    ALTER TABLE public.resigned
      ADD CONSTRAINT resigned_applicant_id_fkey FOREIGN KEY (applicant_id)
      REFERENCES public.applicants(applicant_id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.resigned') IS NOT NULL THEN
    ALTER TABLE public.resigned
      ADD CONSTRAINT resigned_contract_id_fkey FOREIGN KEY (contract_id)
      REFERENCES public.contracts(contract_id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4) Optional data backfill to populate paraphernalia_items and connect rows via item_id.
-- This makes the relationships immediately visible/useful in Supabase.

-- Insert distinct item names found across the three tables.
DO $$
BEGIN
  IF to_regclass('public.paraphernalia_items') IS NOT NULL THEN
    INSERT INTO public.paraphernalia_items (item_name)
    SELECT DISTINCT NULLIF(btrim(items), '')
    FROM public.paraphernalia_inventory
    WHERE to_regclass('public.paraphernalia_inventory') IS NOT NULL
      AND items IS NOT NULL
    UNION
    SELECT DISTINCT NULLIF(btrim(items::text), '')
    FROM public.paraphernalia
    WHERE to_regclass('public.paraphernalia') IS NOT NULL
      AND items IS NOT NULL
    UNION
    SELECT DISTINCT NULLIF(btrim(item::text), '')
    FROM public.restock
    WHERE to_regclass('public.restock') IS NOT NULL
      AND item IS NOT NULL
    ON CONFLICT (item_name) DO NOTHING;
  END IF;
END $$;

-- Backfill item_id in paraphernalia_inventory.
DO $$
BEGIN
  IF to_regclass('public.paraphernalia_inventory') IS NOT NULL THEN
    UPDATE public.paraphernalia_inventory inv
    SET item_id = pi.item_id
    FROM public.paraphernalia_items pi
    WHERE inv.item_id IS NULL
      AND inv.items IS NOT NULL
      AND lower(btrim(inv.items)) = lower(btrim(pi.item_name));
  END IF;
END $$;

-- Backfill item_id in paraphernalia.
DO $$
BEGIN
  IF to_regclass('public.paraphernalia') IS NOT NULL THEN
    UPDATE public.paraphernalia p
    SET item_id = pi.item_id
    FROM public.paraphernalia_items pi
    WHERE p.item_id IS NULL
      AND p.items IS NOT NULL
      AND lower(btrim(p.items::text)) = lower(btrim(pi.item_name));
  END IF;
END $$;

-- Backfill item_id in restock.
DO $$
BEGIN
  IF to_regclass('public.restock') IS NOT NULL THEN
    UPDATE public.restock r
    SET item_id = pi.item_id
    FROM public.paraphernalia_items pi
    WHERE r.item_id IS NULL
      AND r.item IS NOT NULL
      AND lower(btrim(r.item::text)) = lower(btrim(pi.item_name));
  END IF;
END $$;

-- Best-effort: link inventory_id on restock/paraphernalia by item_id.
DO $$
BEGIN
  IF to_regclass('public.restock') IS NOT NULL THEN
    UPDATE public.restock r
    SET inventory_id = inv.id_paraphernalia_inventory
    FROM public.paraphernalia_inventory inv
    WHERE r.inventory_id IS NULL
      AND r.item_id IS NOT NULL
      AND inv.item_id = r.item_id;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.paraphernalia') IS NOT NULL THEN
    UPDATE public.paraphernalia p
    SET inventory_id = inv.id_paraphernalia_inventory
    FROM public.paraphernalia_inventory inv
    WHERE p.inventory_id IS NULL
      AND p.item_id IS NOT NULL
      AND inv.item_id = p.item_id;
  END IF;
END $$;

-- Best-effort: parse numeric quantity from your existing "quanitity" (text) column.
DO $$
BEGIN
  IF to_regclass('public.restock') IS NOT NULL THEN
    UPDATE public.restock
    SET quantity = NULLIF(regexp_replace(quanitity::text, '[^0-9\\.]+', '', 'g'), '')::numeric
    WHERE quantity IS NULL
      AND quanitity IS NOT NULL;
  END IF;
END $$;

-- 5) A unified view (so it *feels* like one table).
-- You can query this view in Supabase as a single dataset.

CREATE OR REPLACE VIEW public.vw_paraphernalia_supply_events AS
SELECT
  'PARAPHERNALIA'::text AS source_table,
  p.id_paraphernalia AS source_id,
  p."timestamp"::timestamptz AS event_time,
  p.action AS event_type,
  p.names AS person_name,
  p.quantity::numeric AS quantity,
  p.price AS unit_price,
  p.item_id,
  pi.item_name,
  p.inventory_id,
  inv.stock_balance,
  inv.stock_in,
  inv.stock_out,
  p.contract_id,
  c.full_name AS contract_full_name,
  c.employee_number AS contract_employee_number
FROM public.paraphernalia p
LEFT JOIN public.paraphernalia_items pi ON pi.item_id = p.item_id
LEFT JOIN public.paraphernalia_inventory inv ON inv.id_paraphernalia_inventory = p.inventory_id
LEFT JOIN public.contracts c ON c.contract_id = p.contract_id

UNION ALL

SELECT
  'RESTOCK'::text AS source_table,
  r.id_restock AS source_id,
  r.timestamptz::timestamptz AS event_time,
  COALESCE(r.status, 'RESTOCK')::text AS event_type,
  NULL::text AS person_name,
  r.quantity AS quantity,
  NULL::numeric AS unit_price,
  r.item_id,
  pi.item_name,
  r.inventory_id,
  inv.stock_balance,
  inv.stock_in,
  inv.stock_out,
  r.contract_id,
  c.full_name AS contract_full_name,
  c.employee_number AS contract_employee_number
FROM public.restock r
LEFT JOIN public.paraphernalia_items pi ON pi.item_id = r.item_id
LEFT JOIN public.paraphernalia_inventory inv ON inv.id_paraphernalia_inventory = r.inventory_id
LEFT JOIN public.contracts c ON c.contract_id = r.contract_id;

-- 6) Unified view (so restock/paraphernalia/inventory/resigned/contracts can be queried as one).
-- This is intentionally a superset view; columns not applicable to a row are NULL.

CREATE OR REPLACE VIEW public.vw_unified_inventory_activity AS
SELECT
  'PARAPHERNALIA'::text AS source_table,
  p.id_paraphernalia AS source_id,
  p."timestamp"::timestamptz AS event_time,
  p.action::text AS event_type,
  NULL::uuid AS applicant_id,
  p.names::text AS person_name,
  p.contract_id,
  c.full_name AS contract_full_name,
  c.employee_number AS contract_employee_number,
  c.status AS contract_status,
  c.start_date AS contract_start_date,
  c.end_date AS contract_end_date,
  p.item_id,
  pi.item_name,
  p.inventory_id,
  inv.stock_balance,
  p.quantity::numeric AS quantity,
  p.price AS unit_price,
  NULL::text AS remarks
FROM public.paraphernalia p
LEFT JOIN public.paraphernalia_items pi ON pi.item_id = p.item_id
LEFT JOIN public.paraphernalia_inventory inv ON inv.id_paraphernalia_inventory = p.inventory_id
LEFT JOIN public.contracts c ON c.contract_id = p.contract_id

UNION ALL

SELECT
  'RESTOCK'::text AS source_table,
  r.id_restock AS source_id,
  r.timestamptz::timestamptz AS event_time,
  COALESCE(r.status, 'RESTOCK')::text AS event_type,
  NULL::uuid AS applicant_id,
  NULL::text AS person_name,
  r.contract_id,
  c.full_name AS contract_full_name,
  c.employee_number AS contract_employee_number,
  c.status AS contract_status,
  c.start_date AS contract_start_date,
  c.end_date AS contract_end_date,
  r.item_id,
  pi.item_name,
  r.inventory_id,
  inv.stock_balance,
  r.quantity AS quantity,
  NULL::numeric AS unit_price,
  NULL::text AS remarks
FROM public.restock r
LEFT JOIN public.paraphernalia_items pi ON pi.item_id = r.item_id
LEFT JOIN public.paraphernalia_inventory inv ON inv.id_paraphernalia_inventory = r.inventory_id
LEFT JOIN public.contracts c ON c.contract_id = r.contract_id

UNION ALL

SELECT
  'PARAPHERNALIA_INVENTORY'::text AS source_table,
  inv.id_paraphernalia_inventory AS source_id,
  COALESCE(inv.updated_at, inv.created_at)::timestamptz AS event_time,
  'INVENTORY_SNAPSHOT'::text AS event_type,
  NULL::uuid AS applicant_id,
  NULL::text AS person_name,
  NULL::uuid AS contract_id,
  NULL::text AS contract_full_name,
  NULL::text AS contract_employee_number,
  NULL::text AS contract_status,
  NULL::date AS contract_start_date,
  NULL::date AS contract_end_date,
  inv.item_id,
  pi.item_name,
  inv.id_paraphernalia_inventory AS inventory_id,
  inv.stock_balance,
  NULL::numeric AS quantity,
  NULL::numeric AS unit_price,
  NULL::text AS remarks
FROM public.paraphernalia_inventory inv
LEFT JOIN public.paraphernalia_items pi ON pi.item_id = inv.item_id

UNION ALL

SELECT
  'CONTRACTS'::text AS source_table,
  c.contract_id AS source_id,
  c.created_at AS event_time,
  'CONTRACT'::text AS event_type,
  c.applicant_id,
  c.full_name AS person_name,
  c.contract_id,
  c.full_name AS contract_full_name,
  c.employee_number AS contract_employee_number,
  c.status AS contract_status,
  c.start_date AS contract_start_date,
  c.end_date AS contract_end_date,
  NULL::uuid AS item_id,
  NULL::text AS item_name,
  NULL::uuid AS inventory_id,
  NULL::numeric AS stock_balance,
  NULL::numeric AS quantity,
  NULL::numeric AS unit_price,
  NULL::text AS remarks
FROM public.contracts c

UNION ALL

SELECT
  'RESIGNED'::text AS source_table,
  r.resigned_id AS source_id,
  r.resigned_at AS event_time,
  'RESIGNED'::text AS event_type,
  r.applicant_id,
  concat_ws(' ', r.first_name, r.middle_name, r.last_name)::text AS person_name,
  r.contract_id,
  c.full_name AS contract_full_name,
  c.employee_number AS contract_employee_number,
  c.status AS contract_status,
  c.start_date AS contract_start_date,
  c.end_date AS contract_end_date,
  NULL::uuid AS item_id,
  NULL::text AS item_name,
  NULL::uuid AS inventory_id,
  NULL::numeric AS stock_balance,
  NULL::numeric AS quantity,
  NULL::numeric AS unit_price,
  r.remarks AS remarks
FROM public.resigned r
LEFT JOIN public.contracts c ON c.contract_id = r.contract_id;

COMMIT;
