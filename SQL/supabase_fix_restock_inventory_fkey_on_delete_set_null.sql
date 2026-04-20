-- Fix: allow deleting paraphernalia_inventory rows without FK errors in restock.
-- Behavior: keep restock history by nulling the inventory link instead of blocking delete.

BEGIN;

-- Clean up potential orphan links before re-adding constraints.
UPDATE public.restock r
SET id_paraphernalia_inventory = NULL
WHERE r.id_paraphernalia_inventory IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.paraphernalia_inventory p
    WHERE p.id_paraphernalia_inventory = r.id_paraphernalia_inventory
  );

-- Main FK currently used by app code.
ALTER TABLE IF EXISTS public.restock
  DROP CONSTRAINT IF EXISTS restock_inventory_fkey;

ALTER TABLE IF EXISTS public.restock
  ADD CONSTRAINT restock_inventory_fkey
  FOREIGN KEY (id_paraphernalia_inventory)
  REFERENCES public.paraphernalia_inventory(id_paraphernalia_inventory)
  ON DELETE SET NULL;

-- Optional linked-schema FK variant (inventory_id) if present in this project version.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'restock'
      AND column_name = 'inventory_id'
  ) THEN
    EXECUTE '
      UPDATE public.restock r
      SET inventory_id = NULL
      WHERE r.inventory_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.paraphernalia_inventory p
          WHERE p.id_paraphernalia_inventory = r.inventory_id
        )';

    EXECUTE 'ALTER TABLE public.restock DROP CONSTRAINT IF EXISTS restock_inventory_id_fkey';

    EXECUTE '
      ALTER TABLE public.restock
      ADD CONSTRAINT restock_inventory_id_fkey
      FOREIGN KEY (inventory_id)
      REFERENCES public.paraphernalia_inventory(id_paraphernalia_inventory)
      ON DELETE SET NULL';
  END IF;
END
$$;

COMMIT;
