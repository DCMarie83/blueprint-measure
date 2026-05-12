-- ════════════════════════════════════════════════════════════
-- P6 Estimate Foundation: pricing library + estimates tables
-- 5/13/26 — Already applied via SQL Editor. Git history only.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── pricing_categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pricing_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  trade_vertical text NOT NULL DEFAULT 'painting',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_categories_company_idx ON public.pricing_categories(company_id);
ALTER TABLE public.pricing_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY pricing_categories_select ON public.pricing_categories FOR SELECT USING (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY pricing_categories_insert ON public.pricing_categories FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY pricing_categories_update ON public.pricing_categories FOR UPDATE USING (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY pricing_categories_delete ON public.pricing_categories FOR DELETE USING (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

-- ── pricing_items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pricing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.pricing_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('sf', 'lf', 'each', 'hour', 'lump_sum')),
  default_rate numeric(10,2) NOT NULL DEFAULT 0,
  default_rate_better numeric(10,2),
  default_rate_best numeric(10,2),
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_items_company_idx ON public.pricing_items(company_id);
CREATE INDEX IF NOT EXISTS pricing_items_category_idx ON public.pricing_items(category_id);
ALTER TABLE public.pricing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY pricing_items_select ON public.pricing_items FOR SELECT USING (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY pricing_items_insert ON public.pricing_items FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY pricing_items_update ON public.pricing_items FOR UPDATE USING (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY pricing_items_delete ON public.pricing_items FOR DELETE USING (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

-- ── estimates ────────────────────────────────────────────────────────────────
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS next_estimate_number integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  estimate_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined','expired')),
  good_total numeric(12,2) NOT NULL DEFAULT 0,
  better_total numeric(12,2) NOT NULL DEFAULT 0,
  best_total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimates_project_idx ON public.estimates(project_id);
CREATE INDEX IF NOT EXISTS estimates_company_idx ON public.estimates(company_id);
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY estimates_select ON public.estimates FOR SELECT USING (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY estimates_insert ON public.estimates FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY estimates_update ON public.estimates FOR UPDATE USING (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY estimates_delete ON public.estimates FOR DELETE USING (
  company_id IN (SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid())
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

-- ── estimate_line_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estimate_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  pricing_item_id uuid REFERENCES public.pricing_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  category_name text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'sf',
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  rate_good numeric(10,2) NOT NULL DEFAULT 0,
  rate_better numeric(10,2) NOT NULL DEFAULT 0,
  rate_best numeric(10,2) NOT NULL DEFAULT 0,
  total_good numeric(12,2) NOT NULL DEFAULT 0,
  total_better numeric(12,2) NOT NULL DEFAULT 0,
  total_best numeric(12,2) NOT NULL DEFAULT 0,
  source_zone_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_line_items_estimate_idx ON public.estimate_line_items(estimate_id);
ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY eli_select ON public.estimate_line_items FOR SELECT USING (
  estimate_id IN (SELECT id FROM public.estimates WHERE company_id IN (
    SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
  ))
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY eli_insert ON public.estimate_line_items FOR INSERT WITH CHECK (
  estimate_id IN (SELECT id FROM public.estimates WHERE company_id IN (
    SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
  ))
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY eli_update ON public.estimate_line_items FOR UPDATE USING (
  estimate_id IN (SELECT id FROM public.estimates WHERE company_id IN (
    SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
  ))
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);
CREATE POLICY eli_delete ON public.estimate_line_items FOR DELETE USING (
  estimate_id IN (SELECT id FROM public.estimates WHERE company_id IN (
    SELECT company_id FROM public.user_profiles WHERE user_id = auth.uid()
  ))
  OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
);

-- ── generate_estimate_number RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_estimate_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  UPDATE companies SET next_estimate_number = next_estimate_number + 1
  WHERE id = p_company_id
  RETURNING next_estimate_number - 1 INTO v_seq;
  RETURN 'EST-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- ── Seed starter pricing items for all existing companies ────────────────────
DO $$
DECLARE
  co RECORD;
  cat_interior uuid;
  cat_exterior uuid;
  cat_prep uuid;
  cat_trim uuid;
BEGIN
  FOR co IN SELECT id FROM companies LOOP
    -- Skip if already seeded
    IF EXISTS (SELECT 1 FROM pricing_categories WHERE company_id = co.id) THEN
      CONTINUE;
    END IF;

    INSERT INTO pricing_categories (company_id, name, sort_order) VALUES (co.id, 'Interior', 1) RETURNING id INTO cat_interior;
    INSERT INTO pricing_categories (company_id, name, sort_order) VALUES (co.id, 'Exterior', 2) RETURNING id INTO cat_exterior;
    INSERT INTO pricing_categories (company_id, name, sort_order) VALUES (co.id, 'Surface Prep', 3) RETURNING id INTO cat_prep;
    INSERT INTO pricing_categories (company_id, name, sort_order) VALUES (co.id, 'Trim & Detail', 4) RETURNING id INTO cat_trim;

    INSERT INTO pricing_items (company_id, category_id, name, unit, default_rate, default_rate_better, default_rate_best, sort_order) VALUES
      (co.id, cat_interior, 'Wall paint — 2 coats, mid-grade', 'sf', 1.50, 2.25, 3.00, 1),
      (co.id, cat_interior, 'Ceiling paint — flat finish', 'sf', 1.25, 1.75, 2.50, 2),
      (co.id, cat_exterior, 'Exterior body — 2 coats', 'sf', 2.00, 3.00, 4.00, 1),
      (co.id, cat_exterior, 'Pressure wash', 'sf', 0.35, 0.50, 0.75, 2),
      (co.id, cat_prep, 'Surface prep — patch & sand', 'sf', 0.75, 1.00, 1.50, 1),
      (co.id, cat_prep, 'Primer coat', 'sf', 0.85, 1.10, 1.50, 2),
      (co.id, cat_prep, 'Caulking — interior joints', 'lf', 1.50, 2.00, 3.00, 3),
      (co.id, cat_trim, 'Trim paint — doors & frames', 'each', 85.00, 125.00, 175.00, 1),
      (co.id, cat_trim, 'Accent wall — feature color', 'sf', 2.50, 3.50, 5.00, 2);
  END LOOP;
END $$;

-- ── Seed trigger for new companies ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_pricing_for_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat_interior uuid;
  cat_exterior uuid;
  cat_prep uuid;
  cat_trim uuid;
BEGIN
  INSERT INTO pricing_categories (company_id, name, sort_order) VALUES (NEW.id, 'Interior', 1) RETURNING id INTO cat_interior;
  INSERT INTO pricing_categories (company_id, name, sort_order) VALUES (NEW.id, 'Exterior', 2) RETURNING id INTO cat_exterior;
  INSERT INTO pricing_categories (company_id, name, sort_order) VALUES (NEW.id, 'Surface Prep', 3) RETURNING id INTO cat_prep;
  INSERT INTO pricing_categories (company_id, name, sort_order) VALUES (NEW.id, 'Trim & Detail', 4) RETURNING id INTO cat_trim;

  INSERT INTO pricing_items (company_id, category_id, name, unit, default_rate, default_rate_better, default_rate_best, sort_order) VALUES
    (NEW.id, cat_interior, 'Wall paint — 2 coats, mid-grade', 'sf', 1.50, 2.25, 3.00, 1),
    (NEW.id, cat_interior, 'Ceiling paint — flat finish', 'sf', 1.25, 1.75, 2.50, 2),
    (NEW.id, cat_exterior, 'Exterior body — 2 coats', 'sf', 2.00, 3.00, 4.00, 1),
    (NEW.id, cat_exterior, 'Pressure wash', 'sf', 0.35, 0.50, 0.75, 2),
    (NEW.id, cat_prep, 'Surface prep — patch & sand', 'sf', 0.75, 1.00, 1.50, 1),
    (NEW.id, cat_prep, 'Primer coat', 'sf', 0.85, 1.10, 1.50, 2),
    (NEW.id, cat_prep, 'Caulking — interior joints', 'lf', 1.50, 2.00, 3.00, 3),
    (NEW.id, cat_trim, 'Trim paint — doors & frames', 'each', 85.00, 125.00, 175.00, 1),
    (NEW.id, cat_trim, 'Accent wall — feature color', 'sf', 2.50, 3.50, 5.00, 2);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_pricing_trigger ON public.companies;
CREATE TRIGGER seed_pricing_trigger
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_pricing_for_company();

COMMIT;
