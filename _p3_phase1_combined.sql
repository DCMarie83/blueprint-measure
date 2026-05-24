-- ════════════════════════════════════════════════════════════
-- P3 Phase 1 — COMBINED MIGRATION (8 files in one transaction)
-- Run this ONCE in Supabase SQL Editor
-- If any statement fails, the entire transaction rolls back automatically.
-- After this succeeds, run the verification queries separately.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1 of 8: sessions company_id + tenant-scoped RLS
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- 2 of 8: zones company_id + tenant-scoped RLS
-- ────────────────────────────────────────────────────────────

-- 1. Add column
ALTER TABLE public.zones ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 2. Backfill from sessions (which was just backfilled above)
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

-- ────────────────────────────────────────────────────────────
-- 3 of 8: projects RLS rewrite to tenant-scoped
-- ────────────────────────────────────────────────────────────

-- projects.company_id already exists (added in kanban_prep migration)
-- Preserves anon portal policy (anon_portal_projects_select)

-- 1. Drop existing user-scoped policies only
DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_own" ON public.projects;
DROP POLICY IF EXISTS "projects_update_own" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_own" ON public.projects;

-- 2. Create tenant-scoped policies for authenticated users
CREATE POLICY "projects_select_tenant"
  ON public.projects FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY "projects_insert_tenant"
  ON public.projects FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY "projects_update_tenant"
  ON public.projects FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY "projects_delete_tenant"
  ON public.projects FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

-- NOTE: anon_portal_projects_select is untouched — anon clients can still see portal-enabled projects

-- ────────────────────────────────────────────────────────────
-- 4 of 8: companies authenticated SELECT policy
-- ────────────────────────────────────────────────────────────

-- Preserves existing anon_portal_companies_select policy

-- Authenticated users can read their own company
CREATE POLICY "companies_select_own_tenant"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

-- ────────────────────────────────────────────────────────────
-- 5 of 8: subscription_status CHECK constraint
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND constraint_name = 'subscription_status_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT subscription_status_check
      CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled', 'paused', 'pilot'));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6 of 8: plans table new columns
-- ────────────────────────────────────────────────────────────

-- The plans table was created via Supabase dashboard.
-- Existing columns: key, display_name, monthly_price_cents,
--   is_active, sort_order, storage_limit_mb, seat_limit,
--   blueprint_limit, features (jsonb)

-- Add an id column if it doesn't exist (dashboard-created tables may use key as PK)
-- The plans table likely already has an id — this is defensive
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Backfill any rows missing id
UPDATE public.plans SET id = gen_random_uuid() WHERE id IS NULL;

-- Ensure id is NOT NULL
ALTER TABLE public.plans ALTER COLUMN id SET NOT NULL;

-- Add UNIQUE constraint on id if neither PK nor UNIQUE exists on it
DO $$
DECLARE
  id_has_pk_or_unique boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'plans'
      AND ccu.column_name = 'id'
      AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
  ) INTO id_has_pk_or_unique;

  IF NOT id_has_pk_or_unique THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_id_unique UNIQUE (id);
  END IF;
END $$;

-- New pricing columns
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS monthly_price numeric(10,2);
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS annual_price numeric(10,2);
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_seats integer;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_storage_gb integer;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_signups integer;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS signup_count integer DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS next_plan_id uuid;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_intro_tier boolean DEFAULT false;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS trial_days integer DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_price_id_monthly text;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_price_id_annual text;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Self-referencing FK for cohort chain (next_plan_id → plans.id)
-- Wrapped in DO block in case constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'plans'
      AND constraint_name = 'plans_next_plan_id_fkey'
  ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_next_plan_id_fkey
      FOREIGN KEY (next_plan_id) REFERENCES public.plans(id);
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.plans_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_updated_at ON public.plans;
CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.plans_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 7 of 8: archive legacy plans + seed new 4-tier ladder
-- ────────────────────────────────────────────────────────────

-- Chain: Founding 500 → Early Adopters → Intro Sale → Standard

-- 1. Archive all existing plan rows
UPDATE public.plans
SET is_active = false,
    archived_at = now()
WHERE archived_at IS NULL;

-- 2. Insert 4 new plans (next_plan_id wired in step 3)
INSERT INTO public.plans (
  key, display_name, monthly_price, annual_price,
  max_seats, max_storage_gb, max_signups, signup_count,
  is_active, is_intro_tier, display_order, trial_days,
  features
) VALUES
  (
    'founding_500', 'Founding 500',
    79.00, 805.80,
    1, 5, 500, 0,
    true, true, 1, 0,
    '{"blueprint_measurement":true,"multi_page_pdf":true,"csv_export":true,"redraw_zones":true,"paint_calculator":true,"ai_scale_detection":true,"wall_calculator":true,"test_mode":true}'::jsonb
  ),
  (
    'early_adopters', 'Early Adopters',
    99.00, 1009.80,
    2, 5, 250, 0,
    true, true, 2, 0,
    '{"blueprint_measurement":true,"multi_page_pdf":true,"csv_export":true,"redraw_zones":true,"paint_calculator":true,"ai_scale_detection":true,"wall_calculator":true,"test_mode":true}'::jsonb
  ),
  (
    'intro_sale', 'Intro Sale',
    119.00, 1213.80,
    2, 5, 250, 0,
    true, true, 3, 0,
    '{"blueprint_measurement":true,"multi_page_pdf":true,"csv_export":true,"redraw_zones":true,"paint_calculator":true,"ai_scale_detection":true,"wall_calculator":true,"test_mode":true}'::jsonb
  ),
  (
    'standard', 'Standard',
    139.00, 1417.80,
    2, 5, NULL, 0,
    true, false, 4, 0,
    '{"blueprint_measurement":true,"multi_page_pdf":true,"csv_export":true,"redraw_zones":true,"paint_calculator":true,"ai_scale_detection":true,"wall_calculator":true,"test_mode":true}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- 3. Wire the cohort chain: founding_500 → early_adopters → intro_sale → standard
UPDATE public.plans
SET next_plan_id = (SELECT id FROM public.plans WHERE key = 'early_adopters' LIMIT 1)
WHERE key = 'founding_500';

UPDATE public.plans
SET next_plan_id = (SELECT id FROM public.plans WHERE key = 'intro_sale' LIMIT 1)
WHERE key = 'early_adopters';

UPDATE public.plans
SET next_plan_id = (SELECT id FROM public.plans WHERE key = 'standard' LIMIT 1)
WHERE key = 'intro_sale';

-- Standard has no next_plan_id (terminal tier)

-- ────────────────────────────────────────────────────────────
-- 8 of 8: companies pricing + Stripe + white-label columns
-- ────────────────────────────────────────────────────────────

-- Additive only — old plan text column is preserved (grandfather support)

-- Pricing linkage (Decision A: plan_id FK + plan_key cached text)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS plan_key text;

-- Price locking — captures the rate a tenant signed up at
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS locked_price_monthly numeric(10,2);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS locked_price_annual numeric(10,2);

-- Founding member tracking
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS founding_member_number integer;

-- Add UNIQUE constraint for founding_member_number (wrapped for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND constraint_name = 'companies_founding_member_number_key'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_founding_member_number_key UNIQUE (founding_member_number);
  END IF;
END $$;

-- Stripe integration
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Billing
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS billing_email text;

-- White-label
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url text;

-- NGA referral website add-on
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS nga_website_active boolean DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS nga_website_tier text;

-- NGA tier CHECK constraint (wrapped for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND constraint_name = 'companies_nga_website_tier_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_nga_website_tier_check
      CHECK (nga_website_tier IS NULL OR nga_website_tier IN ('3pg', '5pg'));
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS companies_plan_id_idx
  ON public.companies(plan_id);

CREATE INDEX IF NOT EXISTS companies_founding_number_idx
  ON public.companies(founding_member_number)
  WHERE founding_member_number IS NOT NULL;

COMMIT;
