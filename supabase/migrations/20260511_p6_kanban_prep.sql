-- =============================================================================
-- P6 Kanban + Lite CRM prep (5/11/26)
-- - Rename projects.tenant_id → company_id for consistency
-- - New tables: clients, kanban_columns
-- - Extend projects table with Kanban + CRM fields
-- - Seed 3 base columns for all existing companies
-- - Trigger: auto-seed 3 base columns on new company insertion
-- =============================================================================

-- ── Defensive rename: only if tenant_id still exists ─────────────────────────
-- (Live DB already has company_id; this is for migration idempotency)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE public.projects RENAME COLUMN tenant_id TO company_id;
  END IF;
END $$;

-- ── clients table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  address jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clients_company_id_idx ON public.clients(company_id);
CREATE INDEX IF NOT EXISTS clients_email_idx ON public.clients(email) WHERE email IS NOT NULL;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_select ON public.clients FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY clients_insert ON public.clients FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY clients_update ON public.clients FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY clients_delete ON public.clients FOR DELETE
  USING (
    company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

-- ── kanban_columns table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kanban_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL,
  is_base boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, position)
);

CREATE INDEX IF NOT EXISTS kanban_columns_company_id_position_idx
  ON public.kanban_columns(company_id, position);

ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY kanban_columns_select ON public.kanban_columns FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY kanban_columns_insert ON public.kanban_columns FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY kanban_columns_update ON public.kanban_columns FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

CREATE POLICY kanban_columns_delete ON public.kanban_columns FOR DELETE
  USING (
    is_base = false
    AND (
      company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
      OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
    )
  );

-- ── Extend projects with Kanban + CRM fields ─────────────────────────────────
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kanban_column_id uuid REFERENCES public.kanban_columns(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS estimated_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS contract_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS portal_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id);

-- Note: projects.status already exists (CHECK: active/archived/complete).
-- The kanban column handles workflow state; projects.status stays for lifecycle.

CREATE INDEX IF NOT EXISTS projects_client_id_idx ON public.projects(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_kanban_column_id_idx ON public.projects(kanban_column_id) WHERE kanban_column_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_portal_token_idx ON public.projects(portal_token) WHERE portal_token IS NOT NULL;

-- ── Seed 3 base columns for all existing companies ───────────────────────────
INSERT INTO public.kanban_columns (company_id, name, position, is_base)
SELECT c.id, 'Measurements/Estimates', 1, true FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.kanban_columns kc
  WHERE kc.company_id = c.id AND kc.position = 1
);

INSERT INTO public.kanban_columns (company_id, name, position, is_base)
SELECT c.id, 'Sent to Client', 2, true FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.kanban_columns kc
  WHERE kc.company_id = c.id AND kc.position = 2
);

INSERT INTO public.kanban_columns (company_id, name, position, is_base)
SELECT c.id, 'Booked', 3, true FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.kanban_columns kc
  WHERE kc.company_id = c.id AND kc.position = 3
);

-- Backfill: drop all existing projects into Measurements/Estimates column
UPDATE public.projects p
SET kanban_column_id = (
  SELECT id FROM public.kanban_columns kc
  WHERE kc.company_id = p.company_id AND kc.position = 1
)
WHERE p.kanban_column_id IS NULL AND p.company_id IS NOT NULL;

-- ── Trigger: auto-seed base columns on new company insertion ─────────────────
CREATE OR REPLACE FUNCTION public.seed_base_kanban_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.kanban_columns (company_id, name, position, is_base)
  VALUES
    (NEW.id, 'Measurements/Estimates', 1, true),
    (NEW.id, 'Sent to Client', 2, true),
    (NEW.id, 'Booked', 3, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_base_kanban_columns_trigger ON public.companies;
CREATE TRIGGER seed_base_kanban_columns_trigger
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_base_kanban_columns();
