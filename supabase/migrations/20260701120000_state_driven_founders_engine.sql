update public.plans set display_name = 'Founders Promotion', monthly_price = 79.99,  annual_price = 815.90,  monthly_price_cents = 7999  where key = 'founding_500';
update public.plans set display_name = 'Early Birds',         monthly_price = 99.99,  annual_price = 1019.90, monthly_price_cents = 9999  where key = 'early_adopters';
update public.plans set display_name = 'Sale Price',          monthly_price = 119.99, annual_price = 1223.90, monthly_price_cents = 11999 where key = 'intro_sale';
update public.plans set display_name = 'Standard',            monthly_price = 139.99, annual_price = 1427.90, monthly_price_cents = 13999 where key = 'standard';

create table if not exists public.plan_state_quotas (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  state text not null,
  max_signups integer not null,
  signup_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, state)
);

alter table public.plan_state_quotas enable row level security;

drop policy if exists "Super admin manages state quotas" on public.plan_state_quotas;
create policy "Super admin manages state quotas"
  on public.plan_state_quotas for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

insert into public.plan_state_quotas (plan_id, state, max_signups, signup_count)
select p.id, s.code, 25, 0
from (values
  ('5de6d59b-6687-4d7e-af44-1685d4e96e3f'::uuid),
  ('32e25806-ac64-4013-96af-c46cdef5a7b9'::uuid)
) as p(id)
cross join (values
  ('AL'),('AK'),('AZ'),('AR'),('CA'),('CO'),('CT'),('DE'),('DC'),('FL'),
  ('GA'),('HI'),('ID'),('IL'),('IN'),('IA'),('KS'),('KY'),('LA'),('ME'),
  ('MD'),('MA'),('MI'),('MN'),('MS'),('MO'),('MT'),('NE'),('NV'),('NH'),
  ('NJ'),('NM'),('NY'),('NC'),('ND'),('OH'),('OK'),('OR'),('PA'),('RI'),
  ('SC'),('SD'),('TN'),('TX'),('UT'),('VT'),('VA'),('WA'),('WV'),('WI'),
  ('WY')
) as s(code)
on conflict (plan_id, state) do nothing;

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
  v_quota_id             uuid;
  v_loop_plan_id         uuid;
  v_qcount               integer;
  v_qmax                 integer;
  v_new_state_count      integer;
  v_chosen_plan_id       uuid;
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

    v_chosen_plan_id := NULL;

    IF v_state IS NOT NULL THEN
      FOR v_quota_id, v_loop_plan_id IN
        SELECT q.id, q.plan_id
        FROM public.plan_state_quotas q
        JOIN public.plans p ON p.id = q.plan_id
        WHERE q.state = v_state
          AND p.is_active = true
        ORDER BY p.display_order
      LOOP
        SELECT signup_count, max_signups
        INTO v_qcount, v_qmax
        FROM public.plan_state_quotas
        WHERE id = v_quota_id
        FOR UPDATE;

        IF v_qcount < v_qmax THEN
          UPDATE public.plan_state_quotas
          SET signup_count = signup_count + 1, updated_at = now()
          WHERE id = v_quota_id
          RETURNING signup_count INTO v_new_state_count;

          v_chosen_plan_id := v_loop_plan_id;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF v_chosen_plan_id IS NULL THEN
      SELECT id INTO v_chosen_plan_id
      FROM public.plans
      WHERE key = 'standard' AND is_active = true;
      v_new_state_count := NULL;
    END IF;

    SELECT id, key, monthly_price, annual_price, features, trial_days
    INTO v_plan
    FROM public.plans
    WHERE id = v_chosen_plan_id;

    IF v_plan.key = 'founding_500' THEN
      v_founding_number := v_new_state_count;
    ELSE
      v_founding_number := NULL;
    END IF;

    IF v_plan.id IS NOT NULL THEN
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
      RAISE WARNING 'handle_new_user: no plan resolved (standard missing?) for self-serve user %', NEW.id;

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
