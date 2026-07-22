-- Applied live in SQL Editor 2026-07-22. Matches prod. Migration ledger is dead. Never run via CLI.

CREATE OR REPLACE FUNCTION public.seed_company_pricing(p_company_id uuid, p_trade text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cat_interior uuid; cat_exterior uuid; cat_prep uuid; cat_trim uuid;
  v_cat_id uuid;
  v_last_cat text := NULL;
  v_cat_sort int := 0;
  lib RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM public.pricing_categories WHERE company_id = p_company_id) THEN
    RETURN;
  END IF;

  IF p_trade = 'painting' THEN
    INSERT INTO public.pricing_categories (company_id, name, trade_vertical, sort_order)
      VALUES (p_company_id, 'Interior', 'painting', 1) RETURNING id INTO cat_interior;
    INSERT INTO public.pricing_categories (company_id, name, trade_vertical, sort_order)
      VALUES (p_company_id, 'Exterior', 'painting', 2) RETURNING id INTO cat_exterior;
    INSERT INTO public.pricing_categories (company_id, name, trade_vertical, sort_order)
      VALUES (p_company_id, 'Surface Prep', 'painting', 3) RETURNING id INTO cat_prep;
    INSERT INTO public.pricing_categories (company_id, name, trade_vertical, sort_order)
      VALUES (p_company_id, 'Trim & Detail', 'painting', 4) RETURNING id INTO cat_trim;

    INSERT INTO public.pricing_items (company_id, category_id, name, unit, default_rate, sort_order, source) VALUES
      (p_company_id, cat_interior, 'Wall paint - 2 coats, mid-grade', 'sf', 1.50, 1, 'seeded'),
      (p_company_id, cat_interior, 'Ceiling paint - flat finish', 'sf', 1.25, 2, 'seeded'),
      (p_company_id, cat_exterior, 'Exterior body - 2 coats', 'sf', 2.00, 1, 'seeded'),
      (p_company_id, cat_exterior, 'Pressure wash', 'sf', 0.35, 2, 'seeded'),
      (p_company_id, cat_prep, 'Surface prep - patch & sand', 'sf', 0.75, 1, 'seeded'),
      (p_company_id, cat_prep, 'Primer coat', 'sf', 0.85, 2, 'seeded'),
      (p_company_id, cat_prep, 'Caulking - interior joints', 'lf', 1.50, 3, 'seeded'),
      (p_company_id, cat_trim, 'Trim paint - doors & frames', 'each', 85.00, 1, 'seeded'),
      (p_company_id, cat_trim, 'Accent wall - feature color', 'sf', 2.50, 2, 'seeded');
  ELSE
    FOR lib IN
      SELECT category, name, unit, sort_order
      FROM public.work_item_library
      WHERE trade_vertical = p_trade AND is_active = true
      ORDER BY sort_order, name
    LOOP
      IF v_last_cat IS DISTINCT FROM lib.category THEN
        v_cat_sort := v_cat_sort + 1;
        INSERT INTO public.pricing_categories (company_id, name, trade_vertical, sort_order)
        VALUES (p_company_id, lib.category, p_trade, v_cat_sort)
        RETURNING id INTO v_cat_id;
        v_last_cat := lib.category;
      END IF;
      INSERT INTO public.pricing_items (company_id, category_id, name, unit, default_rate, sort_order, source)
      VALUES (p_company_id, v_cat_id, lib.name, lib.unit, 0, lib.sort_order, 'seeded');
    END LOOP;
  END IF;
END;
$function$

update pricing_items set source = 'seeded'
where default_rate = 0
  and default_rate_better is null
  and default_rate_best is null
  and source = 'user'
  and company_id not in (select id from companies where subscription_status = 'pilot')
  and (name, unit) in (select name, unit from work_item_library where is_active = true);
