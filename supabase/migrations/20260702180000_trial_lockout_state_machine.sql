UPDATE public.plans SET trial_days = 14;

ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_subscription_status_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_subscription_status_check
  CHECK (subscription_status IN ('trialing','trial_expired','active','past_due','suspended','canceled','paused','pilot'));

SELECT cron.schedule(
  'expire-trials-daily',
  '0 6 * * *',
  $$UPDATE public.companies
    SET subscription_status = 'trial_expired'
    WHERE subscription_status = 'trialing'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < now() - interval '3 days'$$
);
