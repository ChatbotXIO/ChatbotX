ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "resumeCount" integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Broadcast_deletedAt_idx" ON "Broadcast" ("deletedAt") WHERE "deletedAt" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ContactOnBroadcast_unsent_idx" ON "ContactOnBroadcast" ("broadcastId") WHERE "sent" = false AND "failedAt" IS NULL;
