-- ════════════════════════════════════════════════════════════
-- P6 Session C: Estimate Portal — columns + views + RPCs
-- 5/15/26 — Run each BLOCK separately in SQL Editor.
-- ════════════════════════════════════════════════════════════

-- ── BLOCK 1: Add missing columns to estimates ───────────────────────────
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS response_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS title text;


-- ── BLOCK 2: get_portal_estimate RPC (SECURITY DEFINER) ────────────────
-- Returns estimate + line items as JSONB for portal display.
-- Anon-callable; security comes from portal_token chain validation.

CREATE OR REPLACE FUNCTION public.get_portal_estimate(p_portal_token text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'estimate', jsonb_build_object(
      'id', e.id,
      'estimate_number', e.estimate_number,
      'title', e.title,
      'status', e.status,
      'good_total', e.good_total,
      'better_total', e.better_total,
      'best_total', e.best_total,
      'notes', e.notes,
      'sent_at', e.sent_at,
      'accepted_at', e.accepted_at,
      'declined_at', e.declined_at,
      'decline_reason', e.decline_reason,
      'expires_at', e.expires_at,
      'created_at', e.created_at
    ),
    'line_items', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', li.id,
          'description', li.description,
          'category_name', li.category_name,
          'unit', li.unit,
          'quantity', li.quantity,
          'rate_good', li.rate_good,
          'rate_better', li.rate_better,
          'rate_best', li.rate_best,
          'total_good', li.total_good,
          'total_better', li.total_better,
          'total_best', li.total_best,
          'source_zone_name', li.source_zone_name,
          'sort_order', li.sort_order
        ) ORDER BY li.sort_order
      ) FROM estimate_line_items li WHERE li.estimate_id = e.id),
      '[]'::jsonb
    ),
    'project_name', p.name,
    'project_address', p.address,
    'client_name', c.display_name,
    'client_business', c.business_name,
    'company_name', co.name
  )
  INTO v_result
  FROM estimates e
  JOIN projects p ON p.id = e.project_id
  LEFT JOIN clients c ON c.id = p.client_id
  JOIN companies co ON co.id = e.company_id
  WHERE p.portal_token = p_portal_token
    AND p.portal_enabled = true
    AND e.status IN ('sent', 'accepted', 'declined');

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_estimate(text) TO anon, authenticated;


-- ── BLOCK 3: accept_estimate RPC (SECURITY DEFINER) ────────────────────
-- Validates portal_token → project → estimate chain, sets accepted,
-- auto-moves project to "Accepted" kanban column (position 5).

CREATE OR REPLACE FUNCTION public.accept_estimate(
  p_estimate_id uuid,
  p_portal_token text,
  p_typed_name text DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_company_id uuid;
  v_status text;
  v_accepted_col uuid;
BEGIN
  -- Validate token → project → estimate chain
  SELECT p.id, p.company_id, e.status
  INTO v_project_id, v_company_id, v_status
  FROM estimates e
  JOIN projects p ON p.id = e.project_id
  WHERE e.id = p_estimate_id
    AND p.portal_token = p_portal_token
    AND p.portal_enabled = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid estimate or portal token';
  END IF;

  IF v_status NOT IN ('sent', 'declined') THEN
    RAISE EXCEPTION 'Estimate cannot be accepted from current status: %', v_status;
  END IF;

  -- Find Accepted kanban column for this company (position 5)
  SELECT id INTO v_accepted_col
  FROM kanban_columns
  WHERE company_id = v_company_id AND position = 5
  LIMIT 1;

  -- Update estimate
  UPDATE estimates
  SET status = 'accepted',
      accepted_at = now(),
      decline_reason = NULL,
      declined_at = NULL,
      response_notified_at = NULL,
      updated_at = now()
  WHERE id = p_estimate_id;

  -- Auto-move project to Accepted column
  IF v_accepted_col IS NOT NULL THEN
    UPDATE projects
    SET kanban_column_id = v_accepted_col,
        updated_at = now()
    WHERE id = v_project_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'estimate_id', p_estimate_id,
    'project_id', v_project_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_estimate(uuid, text, text) TO anon, authenticated;


-- ── BLOCK 4: decline_estimate RPC (SECURITY DEFINER) ───────────────────
-- Validates portal_token chain, sets declined. No kanban move.

CREATE OR REPLACE FUNCTION public.decline_estimate(
  p_estimate_id uuid,
  p_portal_token text,
  p_reason text DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_status text;
BEGIN
  -- Validate token → project → estimate chain
  SELECT p.id, e.status
  INTO v_project_id, v_status
  FROM estimates e
  JOIN projects p ON p.id = e.project_id
  WHERE e.id = p_estimate_id
    AND p.portal_token = p_portal_token
    AND p.portal_enabled = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid estimate or portal token';
  END IF;

  IF v_status NOT IN ('sent', 'accepted') THEN
    RAISE EXCEPTION 'Estimate cannot be declined from current status: %', v_status;
  END IF;

  -- Update estimate
  UPDATE estimates
  SET status = 'declined',
      declined_at = now(),
      decline_reason = p_reason,
      accepted_at = NULL,
      response_notified_at = NULL,
      updated_at = now()
  WHERE id = p_estimate_id;

  RETURN jsonb_build_object(
    'success', true,
    'estimate_id', p_estimate_id,
    'project_id', v_project_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_estimate(uuid, text, text) TO anon, authenticated;
