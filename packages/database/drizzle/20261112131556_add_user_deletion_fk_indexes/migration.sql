-- These indexes keep User deletion bounded by preventing FK checks from
-- scanning high-volume child tables. Build outside a transaction so writes
-- continue while each index is created. Drop an invalid leftover from a
-- canceled concurrent build before retrying it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"Account_userId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "Account_userId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Account_userId_idx" ON "Account" ("userId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"Session_userId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "Session_userId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_userId_idx" ON "Session" ("userId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"File_userId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "File_userId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "File_userId_idx" ON "File" ("userId") WHERE "userId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"Import_userId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "Import_userId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Import_userId_idx" ON "Import" ("userId") WHERE "userId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"WhatsappCall_answeredByUserId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "WhatsappCall_answeredByUserId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsappCall_answeredByUserId_idx" ON "WhatsappCall" ("answeredByUserId") WHERE "answeredByUserId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"WhatsappCall_initiatedByUserId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "WhatsappCall_initiatedByUserId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsappCall_initiatedByUserId_idx" ON "WhatsappCall" ("initiatedByUserId") WHERE "initiatedByUserId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"WorkspaceMember_userId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "WorkspaceMember_userId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WorkspaceMember_userId_idx" ON "WorkspaceMember" ("userId");