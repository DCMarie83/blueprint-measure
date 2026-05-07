-- ============================================
-- P6 FOUNDATION — SESSION A MIGRATION
-- Creates projects table + project_id FK on sessions + backfills existing sessions 1:1
-- Reversible via DOWN script at the bottom (commented out)
-- ============================================

BEGIN;

-- 1. CREATE projects TABLE
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NULL, -- populated by P3 multi-tenancy hardening
  name text NOT NULL,
  client_name text,
  address text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  -- Temporary tracking column for 1:1 backfill (dropped before COMMIT)
  _source_session_id uuid NULL
);

CREATE INDEX projects_user_id_idx ON public.projects(user_id);
CREATE INDEX projects_tenant_id_idx ON public.projects(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX projects_deleted_at_idx ON public.projects(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TRIGGER projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. ADD project_id COLUMN TO sessions (nullable initially for backfill)
ALTER TABLE public.sessions ADD COLUMN project_id uuid NULL;

-- 3. BACKFILL: one project per session, tracked by _source_session_id
INSERT INTO public.projects (user_id, name, client_name, created_at, updated_at, _source_session_id)
SELECT user_id, project_name, client_name, created_at, now(), id
FROM public.sessions;

-- Map sessions to their newly-created projects via the tracking column
UPDATE public.sessions s
SET project_id = p.id
FROM public.projects p
WHERE p._source_session_id = s.id;

-- 4. VERIFY backfill — fail loudly if anything is off
DO $$
DECLARE
  unmapped int;
  total_sessions int;
  total_projects int;
BEGIN
  SELECT COUNT(*) INTO total_sessions FROM public.sessions;
  SELECT COUNT(*) INTO unmapped FROM public.sessions WHERE project_id IS NULL;
  SELECT COUNT(*) INTO total_projects FROM public.projects;

  RAISE NOTICE 'Backfill complete: % sessions, % projects created, % unmapped', total_sessions, total_projects, unmapped;

  IF unmapped > 0 THEN
    RAISE EXCEPTION 'Backfill failed: % sessions still have NULL project_id', unmapped;
  END IF;

  IF total_sessions != total_projects THEN
    RAISE EXCEPTION 'Backfill failed: session count (%) does not match project count (%)', total_sessions, total_projects;
  END IF;
END $$;

-- 5. ENFORCE: project_id NOT NULL + add FK constraint
ALTER TABLE public.sessions ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE INDEX sessions_project_id_idx ON public.sessions(project_id);

-- 6. DROP temporary tracking column
ALTER TABLE public.projects DROP COLUMN _source_session_id;

-- 7. ENABLE RLS + add policies (match sessions RLS pattern)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select_own ON public.projects
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY projects_insert_own ON public.projects
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY projects_update_own ON public.projects
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY projects_delete_own ON public.projects
FOR DELETE USING (auth.uid() = user_id);

COMMIT;

-- ============================================
-- DOWN SCRIPT (reversal) — only run if you need to undo this migration
-- Uncomment the lines below and run as a separate query
-- ============================================
-- BEGIN;
-- DROP INDEX IF EXISTS public.sessions_project_id_idx;
-- ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_project_id_fkey;
-- ALTER TABLE public.sessions DROP COLUMN IF EXISTS project_id;
-- DROP TABLE IF EXISTS public.projects CASCADE;
-- COMMIT;
