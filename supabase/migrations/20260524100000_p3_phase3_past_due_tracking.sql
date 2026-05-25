-- ════════════════════════════════════════════════════════════
-- P3 Phase 3: subscription_status_changed_at tracking
-- Auto-updates when subscription_status changes
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS subscription_status_changed_at timestamptz DEFAULT now();

-- Backfill existing rows
UPDATE public.companies
SET subscription_status_changed_at = COALESCE(created_at, now())
WHERE subscription_status_changed_at IS NULL;

-- Function: auto-set subscription_status_changed_at when status changes
CREATE OR REPLACE FUNCTION public.update_subscription_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.subscription_status IS DISTINCT FROM NEW.subscription_status THEN
    NEW.subscription_status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_subscription_status_changed ON public.companies;
CREATE TRIGGER companies_subscription_status_changed
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_subscription_status_changed_at();
