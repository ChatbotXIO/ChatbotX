ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ALTER COLUMN "encryptedAuth" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "MetaCatalogSyncRun" ADD COLUMN IF NOT EXISTS "submissionLeaseId" text;--> statement-breakpoint
UPDATE "MetaCatalogSyncRun"
SET "submissionLeaseId" = 'legacy-' || id
WHERE status = 'running'
  AND direction = 'push'
  AND "submissionLeaseId" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IntegrationMetaCatalog_deletedAt_idx" ON "IntegrationMetaCatalog" ("deletedAt");
