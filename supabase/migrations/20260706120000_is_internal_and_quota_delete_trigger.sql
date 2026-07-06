-- Reconcile: is_internal column + quota-decrement-on-delete trigger.
-- Applied live in SQL Editor on 2026-07-06; this file keeps the repo in sync.

-- 1. is_internal flag on companies (marks test/internal accounts; excludes from founder counting)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

-- 2. Trigger function: decrement plan_state_quotas.signup_count when a non-internal
--    founder/early-bird company is hard-deleted, so the quota slot is freed.
CREATE OR REPLACE FUNCTION public.decrement_quota_on_company_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.plan_key IN ('founding_500', 'early_adopters')
     AND OLD.plan_id IS NOT NULL
     AND OLD.state IS NOT NULL
     AND OLD.is_internal = false
  THEN
    UPDATE public.plan_state_quotas
    SET signup_count = GREATEST(0, signup_count - 1),
        updated_at = now()
    WHERE plan_id = OLD.plan_id
      AND state = OLD.state;
  END IF;
  RETURN OLD;
END;
$$;

-- 3. Wire the trigger
DROP TRIGGER IF EXISTS trg_decrement_quota_on_company_delete ON public.companies;
CREATE TRIGGER trg_decrement_quota_on_company_delete
  BEFORE DELETE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_quota_on_company_delete();
