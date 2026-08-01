-- SQL Script to enable global/system-wide paraphernalia item removals.
-- Run this script in the Supabase SQL Editor (https://app.supabase.com -> SQL Editor).

BEGIN;

-- 1. Create the removed_paraphernalia_items tracking table
CREATE TABLE IF NOT EXISTS public.removed_paraphernalia_items (
    item_name TEXT PRIMARY KEY,
    removed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Grant schema and table permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.removed_paraphernalia_items TO anon, authenticated, service_role;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.removed_paraphernalia_items ENABLE ROW LEVEL SECURITY;

-- 4. Drop pre-existing policies if any to prevent conflicts
DROP POLICY IF EXISTS removed_paraphernalia_items_read ON public.removed_paraphernalia_items;
DROP POLICY IF EXISTS removed_paraphernalia_items_insert ON public.removed_paraphernalia_items;
DROP POLICY IF EXISTS removed_paraphernalia_items_update ON public.removed_paraphernalia_items;
DROP POLICY IF EXISTS removed_paraphernalia_items_delete ON public.removed_paraphernalia_items;
DROP POLICY IF EXISTS removed_paraphernalia_items_all ON public.removed_paraphernalia_items;

-- 5. Create permissive policy for all operations
CREATE POLICY removed_paraphernalia_items_all
    ON public.removed_paraphernalia_items
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 6. Also ensure paraphernalia_items has full permissions
GRANT ALL ON TABLE public.paraphernalia_items TO anon, authenticated, service_role;
ALTER TABLE public.paraphernalia_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paraphernalia_items_legacy_app_access ON public.paraphernalia_items;
CREATE POLICY paraphernalia_items_legacy_app_access
    ON public.paraphernalia_items
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

COMMIT;
