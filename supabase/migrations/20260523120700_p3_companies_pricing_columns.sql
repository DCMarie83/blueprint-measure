-- ════════════════════════════════════════════════════════════
-- P3 Phase 1: Add pricing + Stripe + white-label columns to companies
-- Additive only — old plan text column is preserved (grandfather support)
-- ════════════════════════════════════════════════════════════

-- Pricing linkage (Decision A: plan_id FK + plan_key cached text)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS plan_key text;

-- Price locking — captures the rate a tenant signed up at
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS locked_price_monthly numeric(10,2);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS locked_price_annual numeric(10,2);

-- Founding member tracking
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS founding_member_number integer;

-- Add UNIQUE constraint for founding_member_number (wrapped for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND constraint_name = 'companies_founding_member_number_key'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_founding_member_number_key UNIQUE (founding_member_number);
  END IF;
END $$;

-- Stripe integration
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Billing
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS billing_email text;

-- White-label
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url text;

-- NGA referral website add-on
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS nga_website_active boolean DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS nga_website_tier text;

-- NGA tier CHECK constraint (wrapped for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND constraint_name = 'companies_nga_website_tier_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_nga_website_tier_check
      CHECK (nga_website_tier IS NULL OR nga_website_tier IN ('3pg', '5pg'));
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS companies_plan_id_idx
  ON public.companies(plan_id);

CREATE INDEX IF NOT EXISTS companies_founding_number_idx
  ON public.companies(founding_member_number)
  WHERE founding_member_number IS NOT NULL;
