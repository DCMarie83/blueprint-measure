-- ════════════════════════════════════════════════════════════
-- P6 Session B: Estimate Builder — schema additions + RBAC RLS
-- 5/13/26 — Run each block separately in SQL Editor.
-- ════════════════════════════════════════════════════════════

-- ── BLOCK 1: Add zone-source columns to estimate_line_items ─────────────────
-- Run this block first.

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS source_zone_name text,
  ADD COLUMN IF NOT EXISTS source_measurement_type text;

-- ── BLOCK 2: Drop old pricing_categories write policies ─────────────────────
-- These will be replaced with admin-only versions.

DROP POLICY IF EXISTS pricing_categories_insert ON public.pricing_categories;
DROP POLICY IF EXISTS pricing_categories_update ON public.pricing_categories;
DROP POLICY IF EXISTS pricing_categories_delete ON public.pricing_categories;

-- ── BLOCK 3: Create admin-only pricing_categories write policies ────────────

CREATE POLICY pricing_categories_insert_admin ON public.pricing_categories FOR INSERT WITH CHECK (
  (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

CREATE POLICY pricing_categories_update_admin ON public.pricing_categories FOR UPDATE USING (
  (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

CREATE POLICY pricing_categories_delete_admin ON public.pricing_categories FOR DELETE USING (
  (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

-- ── BLOCK 4: Drop old pricing_items write policies + create admin-only ──────

DROP POLICY IF EXISTS pricing_items_insert ON public.pricing_items;
DROP POLICY IF EXISTS pricing_items_update ON public.pricing_items;
DROP POLICY IF EXISTS pricing_items_delete ON public.pricing_items;

CREATE POLICY pricing_items_insert_admin ON public.pricing_items FOR INSERT WITH CHECK (
  (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

CREATE POLICY pricing_items_update_admin ON public.pricing_items FOR UPDATE USING (
  (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

CREATE POLICY pricing_items_delete_admin ON public.pricing_items FOR DELETE USING (
  (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

-- ── BLOCK 5: Drop old estimates write policies + create admin-only ──────────

DROP POLICY IF EXISTS estimates_insert ON public.estimates;
DROP POLICY IF EXISTS estimates_update ON public.estimates;
DROP POLICY IF EXISTS estimates_delete ON public.estimates;

CREATE POLICY estimates_insert_admin ON public.estimates FOR INSERT WITH CHECK (
  (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

CREATE POLICY estimates_update_admin ON public.estimates FOR UPDATE USING (
  (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

CREATE POLICY estimates_delete_admin ON public.estimates FOR DELETE USING (
  (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
