-- ════════════════════════════════════════════════════════════
-- P6 Portal V1 Session C: portal_email_sent_at tracking
-- 5/13/26
-- Used by auto-email-on-Scheduled trigger to gate single-send.
-- ════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS portal_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.projects.portal_email_sent_at IS
  'Timestamp of first auto-sent portal email when job moved to Scheduled column. NULL = never sent.';

COMMIT;
