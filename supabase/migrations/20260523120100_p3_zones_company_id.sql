-- ════════════════════════════════════════════════════════════
-- P3 Phase 1: Add company_id to zones + tenant-scoped RLS
-- ════════════════════════════════════════════════════════════

-- 1. Add column
ALTER TABLE public.zones ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 2. Backfill from sessions (which was just backfilled in previous migration)
UPDATE public.zones
SET company_id = (
  SELECT s.company_id
  FROM public.sessions s
  WHERE s.id = zones.session_id
)
WHERE company_id IS NULL;

-- 3. Check for remaining NULLs before setting NOT NULL
DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.zones WHERE company_id IS NULL;
  IF null_count > 0 THEN
    RAISE NOTICE 'P3 WARNING: % zones still have NULL company_id — skipping NOT NULL constraint', null_count;
  ELSE
    EXECUTE 'ALTER TABLE public.zones ALTER COLUMN company_id SET NOT NULL';
    RAISE NOTICE 'P3: zones.company_id set to NOT NULL (0 NULLs found)';
  END IF;
END $$;

-- 4. Index
CREATE INDEX IF NOT EXISTS zones_company_id_idx ON public.zones(company_id);

-- 5. Drop existing user-scoped RLS policies
DROP POLICY IF EXISTS "Users can view own zones"              ON public.zones;
DROP POLICY IF EXISTS "Users can create zones in own sessions" ON public.zones;
DROP POLICY IF EXISTS "Users can update own zones"             ON public.zones;
DROP POLICY IF EXISTS "Users can delete own zones"             ON public.zones;

-- 6. Create tenant-scoped RLS policies
CREATE POLICY "zones_select_tenant"
  ON public.zones FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY "zones_insert_tenant"
  ON public.zones FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY "zones_update_tenant"
  ON public.zones FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY "zones_delete_tenant"
  ON public.zones FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );
