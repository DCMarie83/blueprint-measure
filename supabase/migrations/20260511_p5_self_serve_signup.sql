-- P5 Self-Serve Signup Foundation
-- Adds trial columns to companies, creates handle_new_user trigger on auth.users.
-- Run in Supabase SQL Editor. Idempotent (IF NOT EXISTS / OR REPLACE).

BEGIN;

-- ── 1. Add columns to companies ──────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trade_vertical text,
  ADD COLUMN IF NOT EXISTS trial_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trial_duration_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

COMMENT ON COLUMN public.companies.subscription_status IS 'pilot, active, trialing, past_due, suspended, churned';
COMMENT ON COLUMN public.companies.trade_vertical IS 'Trade vertical: painting, general, etc.';
COMMENT ON COLUMN public.companies.trial_enabled IS 'Whether this company is on a trial';
COMMENT ON COLUMN public.companies.trial_duration_days IS 'Trial length in days (default 14)';
COMMENT ON COLUMN public.companies.trial_started_at IS 'When the trial started';
COMMENT ON COLUMN public.companies.trial_ends_at IS 'When the trial expires';

-- ── 2. Trigger function: handle_new_user ─────────────────────────────────────
-- Fires AFTER INSERT on auth.users.
-- If raw_user_meta_data contains signup_path='self_serve':
--   Creates a companies row + user_profiles row atomically.
-- If signup_path is absent (admin-invite path): does nothing — the
--   admin-users Edge Function handles profile creation separately.
-- On failure: re-raises to abort the auth.users INSERT (no orphan data).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
  v_company_name text;
  v_first_name text;
  v_last_name text;
  v_trade text;
  v_company_id uuid;
BEGIN
  meta := NEW.raw_user_meta_data;

  -- Only run for self-serve signups. Admin-invite path uses a separate Edge Function
  -- to insert profile + company, and does not set this metadata field.
  IF meta IS NULL OR meta->>'signup_path' IS DISTINCT FROM 'self_serve' THEN
    RETURN NEW;
  END IF;

  -- Validate required self-serve fields
  IF meta->>'company_name' IS NULL OR meta->>'company_name' = '' THEN
    RAISE EXCEPTION 'Self-serve signup missing required field: company_name';
  END IF;

  v_company_name := meta->>'company_name';
  v_first_name   := coalesce(meta->>'first_name', '');
  v_last_name    := coalesce(meta->>'last_name', '');
  v_trade        := coalesce(meta->>'trade_vertical', 'painting');

  -- Create company
  INSERT INTO public.companies (
    name, plan, subscription_status, trade_vertical,
    trial_enabled, trial_duration_days, trial_started_at, trial_ends_at,
    blueprint_limit, features
  ) VALUES (
    v_company_name,
    'basic',
    'trialing',
    v_trade,
    true,
    14,
    NOW(),
    NOW() + interval '14 days',
    10,
    '{"blueprint_measurement": true, "multi_page_pdf": false, "csv_export": true, "redraw_zones": false, "paint_calculator": false, "ai_scale_detection": false, "wall_calculator": false, "test_mode": false}'::jsonb
  )
  RETURNING id INTO v_company_id;

  -- Create user profile
  INSERT INTO public.user_profiles (
    user_id, email, company_id, full_name, role,
    setup_completed_at, email_consent
  ) VALUES (
    NEW.id,
    NEW.email,
    v_company_id,
    trim(v_first_name || ' ' || v_last_name),
    'contractor_admin',
    NOW(),
    true
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RAISE;
END;
$$;

-- ── 3. Create trigger ────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;
