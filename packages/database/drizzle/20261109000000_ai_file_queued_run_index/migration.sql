-- Built CONCURRENTLY: AIFile takes processing-run progress writes and uploads
-- all the time, and a plain build would block them for the whole scan. This
-- makes run-migrations.mjs run the migration unwrapped, so each statement is
-- re-runnable: a failed concurrent build leaves an INVALID index, dropped first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'AIFile_queuedAt_queued_idx' AND NOT i.indisvalid
  ) THEN
    DROP INDEX "AIFile_queuedAt_queued_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AIFile_queuedAt_queued_idx" ON "AIFile" (("processingRun"->>'queuedAt')) WHERE "processingRun"->>'status' = 'queued';
