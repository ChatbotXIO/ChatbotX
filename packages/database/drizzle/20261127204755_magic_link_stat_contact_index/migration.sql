-- A contact's magic-link clicks are read by (workspaceId, contactId), newest first, for the inbox "Opted In through"
-- list. MagicLinkStat is a hot insert path, so the index is built CONCURRENTLY: no SHARE lock that blocks the inserts.
-- CONCURRENTLY cannot run in a transaction, so the migration runs unwrapped (same precedent as
-- 20261125025425_posts_concurrent_indexes). It is not atomic, so each statement is re-runnable: a build that failed
-- midway leaves an INVALID index that IF NOT EXISTS would skip, so the guard before the build drops it first.
DO $$
BEGIN
  SET LOCAL lock_timeout = '5s';
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"MagicLinkStat_workspaceId_contactId_occurredAt_idx"') AND NOT indisvalid) THEN
    DROP INDEX "MagicLinkStat_workspaceId_contactId_occurredAt_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MagicLinkStat_workspaceId_contactId_occurredAt_idx" ON "MagicLinkStat" ("workspaceId","contactId","occurredAt" DESC);
