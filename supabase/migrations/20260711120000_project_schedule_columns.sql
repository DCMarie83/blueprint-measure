-- Add scheduling fields to projects for job scheduling and client notifications.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS scheduled_start timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS estimated_completion timestamptz;

-- Expose schedule fields in the client portal view.
CREATE OR REPLACE VIEW public.portal_view
WITH (security_invoker = on) AS
SELECT
  p.portal_token,
  p.name           AS project_name,
  p.address,
  p.scheduled_start,
  p.estimated_completion,
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
