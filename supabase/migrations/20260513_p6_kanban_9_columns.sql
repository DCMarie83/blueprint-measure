-- ════════════════════════════════════════════════════════════
-- P6: Kanban 3 → 9 default columns migration
-- 5/13/26
--
-- Replaces the 3-column default (Measurements/Estimates, Sent to Client,
-- Booked) with 9 columns matching the full contractor workflow:
--   1. Measurements & Estimates
--   2. Job Costing
--   3. Review
--   4. Sent to Client
--   5. Accepted
--   6. Deposit Received
--   7. Scheduled
--   8. In Progress
--   9. Complete
--
-- Migrates existing companies. Updates seed trigger so new companies
-- get all 9 cols on signup.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ─── Step 1: Renumber existing columns to make room ─────────────────
-- Work back-to-front to avoid unique-constraint conflicts on (company_id, position).
-- Pos 3 (Booked) → pos 5 (will be renamed to Accepted)
UPDATE public.kanban_columns SET position = 5 WHERE position = 3;
-- Pos 2 (Sent to Client) → pos 4
UPDATE public.kanban_columns SET position = 4 WHERE position = 2;
-- Pos 1 stays at pos 1

-- ─── Step 2: Rename existing columns to new naming ──────────────────
UPDATE public.kanban_columns SET name = 'Measurements & Estimates' WHERE position = 1;
UPDATE public.kanban_columns SET name = 'Sent to Client'           WHERE position = 4;
UPDATE public.kanban_columns SET name = 'Accepted'                 WHERE position = 5;

-- ─── Step 3: Insert new columns at positions 2, 3, 6, 7, 8, 9 ───────
INSERT INTO public.kanban_columns (company_id, name, position, is_base)
SELECT c.id, v.name, v.position, true
FROM public.companies c
CROSS JOIN (VALUES
  ('Job Costing',      2),
  ('Review',           3),
  ('Deposit Received', 6),
  ('Scheduled',        7),
  ('In Progress',      8),
  ('Complete',         9)
) AS v(name, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.kanban_columns kc
  WHERE kc.company_id = c.id AND kc.position = v.position
);

-- ─── Step 4: Replace the seed trigger function for new companies ────
CREATE OR REPLACE FUNCTION public.seed_base_kanban_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.kanban_columns (company_id, name, position, is_base) VALUES
    (NEW.id, 'Measurements & Estimates', 1, true),
    (NEW.id, 'Job Costing',              2, true),
    (NEW.id, 'Review',                   3, true),
    (NEW.id, 'Sent to Client',           4, true),
    (NEW.id, 'Accepted',                 5, true),
    (NEW.id, 'Deposit Received',         6, true),
    (NEW.id, 'Scheduled',                7, true),
    (NEW.id, 'In Progress',              8, true),
    (NEW.id, 'Complete',                 9, true);
  RETURN NEW;
END;
$$;

COMMIT;
