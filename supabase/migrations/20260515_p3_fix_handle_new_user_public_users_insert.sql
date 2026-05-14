-- ════════════════════════════════════════════════════════════
-- P3 Fix: handle_new_user trigger — add missing INSERT INTO public.users
-- 5/15/26 — Applied via SQL Editor (this file documents what was run)
-- ════════════════════════════════════════════════════════════
-- BUG: The handle_new_user trigger (created in 20260511_p5_self_serve_signup.sql)
-- inserts into companies + user_profiles on self-serve signup, but never
-- inserts into public.users. The projects table has:
--
--   user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
--
-- So when a new self-serve user tried to create their first project,
-- the FK constraint failed because no matching public.users row existed.
-- Admin-invite users were unaffected (the admin-users Edge Function
-- handles their public.users row separately).
--
-- FIX: Add INSERT INTO public.users at the end of handle_new_user,
-- for both self-serve AND admin-invite paths (unconditional).
-- ════════════════════════════════════════════════════════════

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
