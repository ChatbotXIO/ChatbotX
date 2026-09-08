ALTER TYPE "coexistRunStatus" ADD VALUE IF NOT EXISTS 'waiting';--> statement-breakpoint
ALTER TABLE "CoexistSyncRun" ADD COLUMN IF NOT EXISTS "pendingPatches" jsonb;--> statement-breakpoint
ALTER TABLE "CoexistSyncRun" ADD COLUMN IF NOT EXISTS "claimToken" text;--> statement-breakpoint
ALTER TABLE "WhatsappCoexistStaging" ADD COLUMN IF NOT EXISTS "parseFailedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "WhatsappSignupSession" ADD COLUMN IF NOT EXISTS "claimedPhoneNumberIds" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WhatsappCoexistStaging_parseFailedAt_idx" ON "WhatsappCoexistStaging" ("parseFailedAt") WHERE "parseFailedAt" IS NOT NULL;
