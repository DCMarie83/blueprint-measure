-- ════════════════════════════════════════════════════════════
-- Company hard-delete FK repair + client_errors location context
-- 7/15/26
-- ════════════════════════════════════════════════════════════
-- CONTEXT: Documents schema changes already applied LIVE in prod
-- via the SQL Editor on 2026-07-15. Running this file against
-- current prod is a safe no-op; it is also correct on a fresh
-- rebuild.
--
-- ROOT CAUSE BEING REPAIRED: projects.company_id had NO foreign
-- key to companies AT ALL. The column was created as tenant_id
-- (20260507130000, "populated by P3 multi-tenancy hardening"),
-- renamed to company_id (20260511_p6_kanban_prep), and the
-- constraint was never added. Projects were therefore never part
-- of the company delete cascade: deleting a company orphaned
-- every project (and their sessions/zones), and the surviving
-- projects' kanban_column_id ON DELETE RESTRICT blocked the
-- kanban_columns cascade — the direct cause of the production
-- error "update or delete on table kanban_columns violates
-- foreign key constraint projects_kanban_column_id_fkey".
-- ════════════════════════════════════════════════════════════

-- 1. client_errors: location context for distinguishing internal
--    testing (e.g. Asia/Bangkok) from real-market users.
ALTER TABLE public.client_errors ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.client_errors ADD COLUMN IF NOT EXISTS locale text;
ALTER TABLE public.client_errors ADD COLUMN IF NOT EXISTS viewport text;

-- 2. THE ROOT FIX — add the missing projects.company_id FK.
--    Guarded: only added if a constraint of this name does not
--    already exist (it now does in prod).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_company_id_fkey'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 3. projects.kanban_column_id: RESTRICT → SET NULL.
--    RESTRICT raced the company cascade (kanban_columns die via
--    company CASCADE while projects still referenced them).
--    Column is nullable and the app LEFT JOINs kanban_columns.
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_kanban_column_id_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_kanban_column_id_fkey
  FOREIGN KEY (kanban_column_id) REFERENCES public.kanban_columns(id)
  ON DELETE SET NULL;

-- 4. recurly_webhook_events.company_id: NO ACTION → SET NULL.
--    Billing audit trail survives as orphaned history rather than
--    being erased with the tenant.
--    (Table exists in prod but not in migration files — guarded
--    so a fresh rebuild without it does not fail.)
DO $$
BEGIN
  IF to_regclass('public.recurly_webhook_events') IS NOT NULL THEN
    ALTER TABLE public.recurly_webhook_events
      DROP CONSTRAINT IF EXISTS recurly_webhook_events_company_id_fkey;
    ALTER TABLE public.recurly_webhook_events
      ADD CONSTRAINT recurly_webhook_events_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 5. session_test_logs.company_id: NO ACTION → CASCADE.
--    (Same guard: table exists in prod but not in migration files.)
DO $$
BEGIN
  IF to_regclass('public.session_test_logs') IS NOT NULL THEN
    ALTER TABLE public.session_test_logs
      DROP CONSTRAINT IF EXISTS session_test_logs_company_id_fkey;
    ALTER TABLE public.session_test_logs
      ADD CONSTRAINT session_test_logs_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 6. time_entries.crew_member_id: RESTRICT → SET NULL.
--    RESTRICT is checked immediately per-row and raced the company
--    cascade (crew_members and time_entries both die via
--    company_id CASCADE, in unspecified order). Entries survive a
--    crew-member deletion as history without a crew reference.
ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS time_entries_crew_member_id_fkey;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_crew_member_id_fkey
  FOREIGN KEY (crew_member_id) REFERENCES public.crew_members(id)
  ON DELETE SET NULL;

-- 7. time_punch_submissions.crew_member_id: RESTRICT → CASCADE.
--    crew_member_id is NOT NULL, so a submission dies with its
--    crew member.
ALTER TABLE public.time_punch_submissions
  DROP CONSTRAINT IF EXISTS time_punch_submissions_crew_member_id_fkey;
ALTER TABLE public.time_punch_submissions
  ADD CONSTRAINT time_punch_submissions_crew_member_id_fkey
  FOREIGN KEY (crew_member_id) REFERENCES public.crew_members(id)
  ON DELETE CASCADE;
