-- ════════════════════════════════════════════════════════════
-- P3 Fix 4: estimate_line_items — restrict writes to admin only
-- 5/13/26
-- ════════════════════════════════════════════════════════════
-- CONTEXT: Current INSERT/UPDATE/DELETE policies allow ANY
-- company user to mutate line items. Should match the admin-only
-- pattern already applied to pricing_categories, pricing_items,
-- and estimates in 20260513_p6_estimate_builder.sql.
--
-- SELECT stays as-is (any company member can read).
-- ════════════════════════════════════════════════════════════

-- Step 1: Drop the permissive write policies
DROP POLICY IF EXISTS eli_insert ON public.estimate_line_items;
DROP POLICY IF EXISTS eli_update ON public.estimate_line_items;
DROP POLICY IF EXISTS eli_delete ON public.estimate_line_items;

-- Step 2: Create admin-only write policies
-- Pattern matches pricing_categories_insert_admin etc.

CREATE POLICY eli_insert_admin ON public.estimate_line_items FOR INSERT WITH CHECK (
  (
    estimate_id IN (
      SELECT e.id FROM public.estimates e
      WHERE e.company_id IN (
        SELECT up.company_id FROM public.user_profiles up
        WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
      )
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

CREATE POLICY eli_update_admin ON public.estimate_line_items FOR UPDATE USING (
  (
    estimate_id IN (
      SELECT e.id FROM public.estimates e
      WHERE e.company_id IN (
        SELECT up.company_id FROM public.user_profiles up
        WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
      )
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

CREATE POLICY eli_delete_admin ON public.estimate_line_items FOR DELETE USING (
  (
    estimate_id IN (
      SELECT e.id FROM public.estimates e
      WHERE e.company_id IN (
        SELECT up.company_id FROM public.user_profiles up
        WHERE up.user_id = auth.uid() AND up.role IN ('contractor_admin')
      )
    )
  )
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
