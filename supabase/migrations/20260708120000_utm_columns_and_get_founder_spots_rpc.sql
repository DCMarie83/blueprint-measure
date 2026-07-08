-- Reconcile: UTM attribution columns, conversion_fired_at, and get_founder_spots RPC.
-- Applied live in SQL Editor during the 2026-07 session; this file keeps the repo in sync.

-- ── 1. UTM attribution columns on companies ─────────────────────────────────
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS utm_term text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS conversion_fired_at timestamptz;

-- ── 2. get_founder_spots RPC (anon-callable) ────────────────────────────────
-- Returns the first available quota tier for a given state, with plan_key for
-- robust client-side tier detection (independent of display_name).
-- DROP first because the return type changed (plan_key was added).
DROP FUNCTION IF EXISTS public.get_founder_spots(text);

CREATE FUNCTION public.get_founder_spots(p_state text)
RETURNS TABLE (
  state text,
  plan_key text,
  plan_name text,
  monthly_price numeric,
  spots_total integer,
  spots_remaining integer,
  next_tier_name text,
  next_tier_price numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    q.state,
    p.key            AS plan_key,
    p.display_name   AS plan_name,
    p.monthly_price,
    q.max_signups    AS spots_total,
    GREATEST(0, q.max_signups - q.signup_count) AS spots_remaining,
    np.display_name  AS next_tier_name,
    np.monthly_price AS next_tier_price
  FROM public.plan_state_quotas q
  JOIN public.plans p  ON p.id = q.plan_id
  LEFT JOIN public.plans np ON np.id = p.next_plan_id
  WHERE q.state = p_state
    AND p.is_active = true
  ORDER BY p.display_order
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_founder_spots(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_founder_spots(text) TO authenticated;
