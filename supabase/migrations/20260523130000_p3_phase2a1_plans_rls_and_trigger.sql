-- ════════════════════════════════════════════════════════════
-- P3 Phase 2a-1: Plans RLS + handle_new_user plan-assignment
-- ════════════════════════════════════════════════════════════
-- A. Enable RLS on plans
-- B. Authenticated users can SELECT active plans
-- C. Super admin gets full CRUD on all plans
-- D. Rewrite handle_new_user to assign plan from cohort ladder
-- E. Recreate the trigger
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────
-- A. Enable RLS on plans table
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- B. Authenticated SELECT — active plans only (super admin sees all)
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "plans_select_active_for_authenticated" ON public.plans;

CREATE POLICY "plans_select_active_for_authenticated"
  ON public.plans FOR SELECT
  TO authenticated
  USING (
    is_active = true
    OR auth.jwt()->>'email' = 'main@ngautomationhub.com'
  );

-- ────────────────────────────────────────────────────────────
-- C. Super admin full CRUD on all plans (including archived)
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "plans_super_admin_all" ON public.plans;

CREATE POLICY "plans_super_admin_all"
  ON public.plans FOR ALL
  TO authenticated
  USING (auth.jwt()->>'email' = 'main@ngautomationhub.com')
  WITH CHECK (auth.jwt()->>'email' = 'main@ngautomationhub.com');

-- ────────────────────────────────────────────────────────────
-- D. Rewrite handle_new_user with plan-assignment logic
-- ────────────────────────────────────────────────────────────

-- Drop existing trigger first (function can't be replaced if signature changes)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta              jsonb;
  v_company_name    text;
  v_first_name      text;
  v_last_name       text;
  v_trade           text;
  v_company_id      uuid;
  v_plan            record;
  v_founding_number integer;
BEGIN
  meta := NEW.raw_user_meta_data;

  -- ── Self-serve path ───────────────────────────────────────────────
  -- Only run company + profile creation for self-serve signups.
  -- Admin-invite path uses a separate Edge Function for those.
  IF meta IS NOT NULL AND meta->>'signup_path' = 'self_serve' THEN

    IF meta->>'company_name' IS NULL OR meta->>'company_name' = '' THEN
      RAISE EXCEPTION 'Self-serve signup missing required field: company_name';
    END IF;

    v_company_name := meta->>'company_name';
    v_first_name   := coalesce(meta->>'first_name', '');
    v_last_name    := coalesce(meta->>'last_name', '');
    v_trade        := coalesce(meta->>'trade_vertical', 'painting');

    -- ── Plan assignment from cohort ladder ─────────────────────────
    -- Lock the first available plan row to prevent race conditions
    -- on signup_count. SKIP LOCKED means concurrent signups won't
    -- block each other — they'll each grab the next available slot.
    SELECT id, key, monthly_price, annual_price, signup_count, max_signups, features, trial_days
    INTO v_plan
    FROM public.plans
    WHERE is_active = true
      AND (signup_count < max_signups OR max_signups IS NULL)
    ORDER BY display_order
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_plan.id IS NOT NULL THEN
      -- Atomically increment signup_count
      UPDATE public.plans
      SET signup_count = signup_count + 1
      WHERE id = v_plan.id;

      -- Determine founding_member_number (only for founding_500 tier)
      IF v_plan.key = 'founding_500' THEN
        v_founding_number := v_plan.signup_count + 1;
      ELSE
        v_founding_number := NULL;
      END IF;

      -- Create company with plan linkage + price snapshot
      INSERT INTO public.companies (
        name, plan, plan_id, plan_key,
        locked_price_monthly, locked_price_annual,
        founding_member_number,
        subscription_status, trade_vertical,
        trial_enabled, trial_duration_days, trial_started_at, trial_ends_at,
        features
      ) VALUES (
        v_company_name,
        v_plan.key,                    -- legacy plan text column (grandfather compat)
        v_plan.id,                     -- new FK to plans table
        v_plan.key,                    -- cached plan key for JOIN-free reads
        v_plan.monthly_price,          -- snapshot price at signup
        v_plan.annual_price,           -- snapshot annual price at signup
        v_founding_number,             -- NULL unless founding_500
        CASE WHEN v_plan.trial_days > 0 THEN 'trialing' ELSE 'active' END,
        v_trade,
        (v_plan.trial_days > 0),                                                    -- trial_enabled
        v_plan.trial_days,                                                          -- trial_duration_days
        CASE WHEN v_plan.trial_days > 0 THEN now() ELSE NULL END,                   -- trial_started_at
        CASE WHEN v_plan.trial_days > 0 THEN now() + (v_plan.trial_days || ' days')::interval ELSE NULL END,  -- trial_ends_at
        v_plan.features                -- all features from plan (all true for new tiers)
      )
      RETURNING id INTO v_company_id;

    ELSE
      -- Defensive fallback: no available plan found (shouldn't happen)
      -- Create company without plan linkage (grandfather behavior)
      RAISE WARNING 'handle_new_user: no available plan found for self-serve signup user %', NEW.id;

      INSERT INTO public.companies (
        name, plan, subscription_status, trade_vertical,
        trial_enabled, trial_duration_days, trial_started_at, trial_ends_at,
        features
      ) VALUES (
        v_company_name,
        'basic',
        'active',
        v_trade,
        false,
        0,
        NULL,
        NULL,
        '{"blueprint_measurement":true,"multi_page_pdf":true,"csv_export":true,"redraw_zones":true,"paint_calculator":true,"ai_scale_detection":true,"wall_calculator":true,"test_mode":true}'::jsonb
      )
      RETURNING id INTO v_company_id;
    END IF;

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

  END IF;

  -- ── All paths: ensure public.users row exists ─────────────────────
  -- projects.user_id references public.users(id), so every auth.users
  -- row needs a matching public.users row or FK inserts will fail.
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RAISE;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- E. Recreate the trigger
-- ────────────────────────────────────────────────────────────

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;
