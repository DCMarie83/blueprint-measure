-- ════════════════════════════════════════════════════════════
-- P3 Phase 1: Extend plans table for new pricing model
-- The plans table was created via Supabase dashboard.
-- Existing columns: key, display_name, monthly_price_cents,
--   is_active, sort_order, storage_limit_mb, seat_limit,
--   blueprint_limit, features (jsonb)
-- ════════════════════════════════════════════════════════════

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
