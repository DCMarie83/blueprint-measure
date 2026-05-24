-- ════════════════════════════════════════════════════════════
-- P3 Phase 1: Add authenticated SELECT policy to companies
-- Preserves existing anon_portal_companies_select policy
-- ════════════════════════════════════════════════════════════

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
