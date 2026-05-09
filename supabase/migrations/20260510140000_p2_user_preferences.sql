-- P2 User Preferences — adds standard SaaS preference columns to user_profiles.
-- Already applied in production via Supabase SQL Editor on 2026-05-10.
-- IF NOT EXISTS makes this safe to re-run.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS date_format text,
  ADD COLUMN IF NOT EXISTS time_format text,
  ADD COLUMN IF NOT EXISTS first_day_of_week text,
  ADD COLUMN IF NOT EXISTS measurement_units text;

COMMENT ON COLUMN public.user_profiles.theme IS 'User theme preference: light, dark, or system. NULL = system fallback.';
COMMENT ON COLUMN public.user_profiles.language IS 'IETF BCP 47 language tag (en, es, etc). NULL = en fallback.';
COMMENT ON COLUMN public.user_profiles.timezone IS 'IANA timezone identifier (e.g., America/New_York). NULL = browser-detected.';
COMMENT ON COLUMN public.user_profiles.date_format IS 'Date format: US (MM/DD/YYYY) or ISO (YYYY-MM-DD). NULL = US fallback.';
COMMENT ON COLUMN public.user_profiles.time_format IS 'Time format: 12h or 24h. NULL = 12h fallback.';
COMMENT ON COLUMN public.user_profiles.first_day_of_week IS 'First day of week: sunday or monday. NULL = sunday fallback.';
COMMENT ON COLUMN public.user_profiles.measurement_units IS 'Measurement units: imperial or metric. NULL = imperial fallback.';
