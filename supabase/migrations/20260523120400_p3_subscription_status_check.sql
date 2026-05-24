-- ════════════════════════════════════════════════════════════
-- P3 Phase 1: Add CHECK constraint to companies.subscription_status
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND constraint_name = 'subscription_status_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT subscription_status_check
      CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled', 'paused', 'pilot'));
  END IF;
END $$;
