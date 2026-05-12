-- ════════════════════════════════════════════════════════════
-- P6 Portal V1 Session A: portal_token backfill + portal_view
-- 5/13/26
-- ════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.projects
SET portal_token = gen_random_uuid()::text
WHERE portal_token IS NULL;

ALTER TABLE public.projects
ALTER COLUMN portal_token SET DEFAULT gen_random_uuid()::text;

ALTER TABLE public.projects
ALTER COLUMN portal_token SET NOT NULL;

CREATE OR REPLACE VIEW public.portal_view
WITH (security_invoker = off) AS
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

GRANT SELECT ON public.portal_view TO anon;
GRANT SELECT ON public.portal_view TO authenticated;

COMMIT;
