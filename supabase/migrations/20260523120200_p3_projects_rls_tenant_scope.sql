-- ════════════════════════════════════════════════════════════
-- P3 Phase 1: Rewrite projects RLS from user-scoped to tenant-scoped
-- projects.company_id already exists (added in kanban_prep migration)
-- Preserves anon portal policy (anon_portal_projects_select)
-- ════════════════════════════════════════════════════════════

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
