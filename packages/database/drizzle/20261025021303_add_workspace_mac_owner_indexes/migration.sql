-- Owner/tenant indexes on WorkspaceMac plus validation of the owner FK added
-- NOT VALID in retain_workspace_billing. CREATE INDEX CONCURRENTLY cannot run in
-- a transaction, so this file runs unwrapped and every statement is re-runnable:
-- each index is preceded by a guard that drops a leftover INVALID build, and
-- VALIDATE CONSTRAINT is a no-op once the constraint is valid.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"WorkspaceMac_ownerId_periodStart_idx"') AND NOT indisvalid) THEN
    DROP INDEX "WorkspaceMac_ownerId_periodStart_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WorkspaceMac_ownerId_periodStart_idx" ON "WorkspaceMac" ("ownerId","periodStart");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"WorkspaceMac_tenantId_periodStart_idx"') AND NOT indisvalid) THEN
    DROP INDEX "WorkspaceMac_tenantId_periodStart_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WorkspaceMac_tenantId_periodStart_idx" ON "WorkspaceMac" ("tenantId","periodStart");--> statement-breakpoint
ALTER TABLE "WorkspaceMac" VALIDATE CONSTRAINT "WorkspaceMac_ownerId_User_id_fkey";
