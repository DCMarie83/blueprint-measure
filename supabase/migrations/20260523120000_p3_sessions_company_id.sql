-- ════════════════════════════════════════════════════════════
-- P3 Phase 1: Add company_id to sessions + tenant-scoped RLS
-- ════════════════════════════════════════════════════════════

-- 1. Add column
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 2. Backfill — two-pass with fallback
-- Pass 1: from user_profiles (authoritative source)
UPDATE public.sessions
SET company_id = (
  SELECT up.company_id
  FROM public.user_profiles up
  WHERE up.user_id = sessions.user_id
  LIMIT 1
)
WHERE company_id IS NULL;

-- Pass 2: from public.users (fallback for users without a profile)
UPDATE public.sessions
SET company_id = (
  SELECT u.company_id
  FROM public.users u
  WHERE u.id = sessions.user_id
  LIMIT 1
)
WHERE company_id IS NULL;

-- 3. Check for remaining NULLs before setting NOT NULL
DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.sessions WHERE company_id IS NULL;
  IF null_count > 0 THEN
    RAISE NOTICE 'P3 WARNING: % sessions still have NULL company_id — skipping NOT NULL constraint', null_count;
  ELSE
    EXECUTE 'ALTER TABLE public.sessions ALTER COLUMN company_id SET NOT NULL';
    RAISE NOTICE 'P3: sessions.company_id set to NOT NULL (0 NULLs found)';
  END IF;
END $$;

-- 4. Index
CREATE INDEX IF NOT EXISTS sessions_company_id_idx ON public.sessions(company_id);

-- 5. Drop existing user-scoped RLS policies
DROP POLICY IF EXISTS "Users can view own sessions"   ON public.sessions;
DROP POLICY IF EXISTS "Users can create own sessions"  ON public.sessions;
DROP POLICY IF EXISTS "Users can update own sessions"  ON public.sessions;
DROP POLICY IF EXISTS "Users can delete own sessions"  ON public.sessions;

-- 6. Create tenant-scoped RLS policies
CREATE POLICY "sessions_select_tenant"
  ON public.sessions FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY "sessions_insert_tenant"
  ON public.sessions FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY "sessions_update_tenant"
  ON public.sessions FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY "sessions_delete_tenant"
  ON public.sessions FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );
