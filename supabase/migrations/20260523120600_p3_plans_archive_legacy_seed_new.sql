-- ════════════════════════════════════════════════════════════
-- P3 Phase 1: Archive legacy plans + seed new 4-tier ladder
-- Chain: Founding 500 → Early Adopters → Intro Sale → Standard
-- ════════════════════════════════════════════════════════════

-- 1. Archive all existing plan rows
UPDATE public.plans
SET is_active = false,
    archived_at = now()
WHERE archived_at IS NULL;

-- 2. Insert 4 new plans (next_plan_id wired in step 3)
INSERT INTO public.plans (
  key, display_name, monthly_price, annual_price,
  max_seats, max_storage_gb, max_signups, signup_count,
  is_active, is_intro_tier, display_order, trial_days,
  features
) VALUES
  (
    'founding_500', 'Founding 500',
    79.00, 805.80,
    1, 5, 500, 0,
    true, true, 1, 0,
    '{"blueprint_measurement":true,"multi_page_pdf":true,"csv_export":true,"redraw_zones":true,"paint_calculator":true,"ai_scale_detection":true,"wall_calculator":true,"test_mode":true}'::jsonb
  ),
  (
    'early_adopters', 'Early Adopters',
    99.00, 1009.80,
    2, 5, 250, 0,
    true, true, 2, 0,
    '{"blueprint_measurement":true,"multi_page_pdf":true,"csv_export":true,"redraw_zones":true,"paint_calculator":true,"ai_scale_detection":true,"wall_calculator":true,"test_mode":true}'::jsonb
  ),
  (
    'intro_sale', 'Intro Sale',
    119.00, 1213.80,
    2, 5, 250, 0,
    true, true, 3, 0,
    '{"blueprint_measurement":true,"multi_page_pdf":true,"csv_export":true,"redraw_zones":true,"paint_calculator":true,"ai_scale_detection":true,"wall_calculator":true,"test_mode":true}'::jsonb
  ),
  (
    'standard', 'Standard',
    139.00, 1417.80,
    2, 5, NULL, 0,
    true, false, 4, 0,
    '{"blueprint_measurement":true,"multi_page_pdf":true,"csv_export":true,"redraw_zones":true,"paint_calculator":true,"ai_scale_detection":true,"wall_calculator":true,"test_mode":true}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- 3. Wire the cohort chain: founding_500 → early_adopters → intro_sale → standard
UPDATE public.plans
SET next_plan_id = (SELECT id FROM public.plans WHERE key = 'early_adopters' LIMIT 1)
WHERE key = 'founding_500';

UPDATE public.plans
SET next_plan_id = (SELECT id FROM public.plans WHERE key = 'intro_sale' LIMIT 1)
WHERE key = 'early_adopters';

UPDATE public.plans
SET next_plan_id = (SELECT id FROM public.plans WHERE key = 'standard' LIMIT 1)
WHERE key = 'intro_sale';

-- Standard has no next_plan_id (terminal tier)
