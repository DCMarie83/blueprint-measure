-- ════════════════════════════════════════════════════════════
-- P3 Fix 3: portal_view — flip security_invoker to ON
-- 5/13/26
-- ════════════════════════════════════════════════════════════
-- CONTEXT: portal_view runs with security_invoker=off, meaning
-- it executes as the view OWNER (postgres), bypassing RLS on
-- all underlying tables. This is a security audit flag.
--
-- FIX: Flip to security_invoker=on so the anon caller's own
-- RLS policies are enforced. Then add narrow anon SELECT
-- policies on the 4 underlying tables so the view still works.
--
-- The anon policies are scoped as tightly as possible:
--   projects       → only portal_enabled rows
--   kanban_columns → only columns belonging to portal-enabled companies
--   clients        → only clients attached to portal-enabled projects
--   companies      → only companies with portal-enabled projects
-- ════════════════════════════════════════════════════════════

-- Step 1: Recreate the view with security_invoker=on
-- (ALTER VIEW ... SET is not supported for security_invoker in all PG versions;
--  CREATE OR REPLACE is the safe path.)
CREATE OR REPLACE VIEW public.portal_view
WITH (security_invoker = on) AS
SELECT
  p.portal_token,
  p.name           AS project_name,
  p.address,
  kc.name          AS status_label,
  c.display_name   AS client_name,
  c.business_name  AS client_business,
  c.client_type,
  co.name          AS company_name
FROM public.projects p
LEFT JOIN public.kanban_columns kc ON kc.id = p.kanban_column_id
LEFT JOIN public.clients        c  ON c.id  = p.client_id
LEFT JOIN public.companies      co ON co.id = p.company_id
WHERE p.portal_enabled = true;

-- Re-grant (CREATE OR REPLACE preserves grants, but be explicit)
GRANT SELECT ON public.portal_view TO anon;
GRANT SELECT ON public.portal_view TO authenticated;

-- Step 2: Anon SELECT policies on underlying tables
-- These are narrow: only rows reachable from portal-enabled projects.

-- projects: anon can see portal-enabled projects only
CREATE POLICY "anon_portal_projects_select"
  ON public.projects
  FOR SELECT
  TO anon
  USING (portal_enabled = true);

-- kanban_columns: anon can see columns for companies that have portal-enabled projects
CREATE POLICY "anon_portal_kanban_select"
  ON public.kanban_columns
  FOR SELECT
  TO anon
  USING (
    company_id IN (
      SELECT DISTINCT company_id FROM public.projects WHERE portal_enabled = true
    )
  );

-- clients: anon can see clients attached to portal-enabled projects
CREATE POLICY "anon_portal_clients_select"
  ON public.clients
  FOR SELECT
  TO anon
  USING (
    id IN (
      SELECT DISTINCT client_id FROM public.projects
      WHERE portal_enabled = true AND client_id IS NOT NULL
    )
  );

-- companies: anon can see companies that have portal-enabled projects
CREATE POLICY "anon_portal_companies_select"
  ON public.companies
  FOR SELECT
  TO anon
  USING (
    id IN (
      SELECT DISTINCT company_id FROM public.projects WHERE portal_enabled = true
    )
  );
