alter table public.companies add column if not exists address_line1 text;
alter table public.companies add column if not exists address_line2 text;
alter table public.companies add column if not exists business_phone text;
alter table public.companies add column if not exists wants_branding_quote boolean not null default false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  meta                   jsonb;
  v_company_name         text;
  v_first_name           text;
  v_last_name            text;
  v_trade                text;
  v_address_line1        text;
  v_address_line2        text;
  v_city                 text;
  v_state                text;
  v_zip                  text;
  v_business_phone       text;
  v_wants_branding_quote boolean;
  v_company_id           uuid;
  v_plan                 record;
  v_founding_number      integer;
BEGIN
  meta := NEW.raw_user_meta_data;

  IF meta IS NOT NULL AND meta->>'signup_path' = 'self_serve' THEN

    IF meta->>'company_name' IS NULL OR meta->>'company_name' = '' THEN
      RAISE EXCEPTION 'Self-serve signup missing required field: company_name';
    END IF;

    v_company_name         := meta->>'company_name';
    v_first_name           := coalesce(meta->>'first_name', '');
    v_last_name            := coalesce(meta->>'last_name', '');
    v_trade                := coalesce(meta->>'trade_vertical', 'painting');
    v_address_line1        := nullif(trim(meta->>'address_line1'), '');
    v_address_line2        := nullif(trim(meta->>'address_line2'), '');
    v_city                 := nullif(trim(meta->>'city'), '');
    v_state                := nullif(trim(meta->>'state'), '');
    v_zip                  := nullif(trim(meta->>'zip'), '');
    v_business_phone       := nullif(trim(meta->>'business_phone'), '');
    v_wants_branding_quote := coalesce((meta->>'wants_branding_quote')::boolean, false);

    SELECT id, key, monthly_price, annual_price, signup_count, max_signups, features, trial_days
    INTO v_plan
    FROM public.plans
    WHERE is_active = true
      AND (signup_count < max_signups OR max_signups IS NULL)
    ORDER BY display_order
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_plan.id IS NOT NULL THEN
      UPDATE public.plans
      SET signup_count = signup_count + 1
      WHERE id = v_plan.id;

      IF v_plan.key = 'founding_500' THEN
        v_founding_number := v_plan.signup_count + 1;
      ELSE
        v_founding_number := NULL;
      END IF;

      INSERT INTO public.companies (
        name, plan, plan_id, plan_key,
        locked_price_monthly, locked_price_annual,
        founding_member_number,
        subscription_status, trade_vertical,
        trial_enabled, trial_duration_days, trial_started_at, trial_ends_at,
        features,
        address_line1, address_line2, city, state, zip, business_phone, wants_branding_quote
      ) VALUES (
        v_company_name,
        v_plan.key,
        v_plan.id,
        v_plan.key,
        v_plan.monthly_price,
        v_plan.annual_price,
        v_founding_number,
        CASE WHEN v_plan.trial_days > 0 THEN 'trialing' ELSE 'active' END,
        v_trade,
        (v_plan.trial_days > 0),
        v_plan.trial_days,
        CASE WHEN v_plan.trial_days > 0 THEN now() ELSE NULL END,
        CASE WHEN v_plan.trial_days > 0 THEN now() + (v_plan.trial_days || ' days')::interval ELSE NULL END,
        v_plan.features,
        v_address_line1, v_address_line2, v_city, v_state, v_zip, v_business_phone, v_wants_branding_quote
      )
      RETURNING id INTO v_company_id;

    ELSE
      RAISE WARNING 'handle_new_user: no available plan found for self-serve signup user %', NEW.id;

      INSERT INTO public.companies (
        name, plan, subscription_status, trade_vertical,
        trial_enabled, trial_duration_days, trial_started_at, trial_ends_at,
        features,
        address_line1, address_line2, city, state, zip, business_phone, wants_branding_quote
      ) VALUES (
        v_company_name,
        'basic',
        'active',
        v_trade,
        false,
        0,
        NULL,
        NULL,
        '{"blueprint_measurement":true,"multi_page_pdf":true,"csv_export":true,"redraw_zones":true,"paint_calculator":true,"ai_scale_detection":true,"wall_calculator":true,"test_mode":true}'::jsonb,
        v_address_line1, v_address_line2, v_city, v_state, v_zip, v_business_phone, v_wants_branding_quote
      )
      RETURNING id INTO v_company_id;
    END IF;

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

  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RAISE;
END;
$function$;
