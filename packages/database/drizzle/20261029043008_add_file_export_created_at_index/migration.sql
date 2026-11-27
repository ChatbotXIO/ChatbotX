-- Partial index for the daily contact-export retention sweep, which reads only
-- export rows by age. "File" also holds every generic upload, so the index is
-- built CONCURRENTLY: this file runs unwrapped and every statement is
-- re-runnable. A failed CONCURRENTLY build leaves an INVALID index that
-- IF NOT EXISTS would skip, so it is dropped first; the session lock_timeout
-- bounds that drop's wait.
SET lock_timeout = '5s';--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"File_export_createdAt_idx"') AND NOT indisvalid) THEN
    DROP INDEX "File_export_createdAt_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "File_export_createdAt_idx" ON "File" ("createdAt") WHERE "contextType" = 'export';--> statement-breakpoint
RESET lock_timeout;
