ALTER TABLE "UserQuota" ADD COLUMN "channelsTornDownAt" timestamp(6) with time zone;--> statement-breakpoint
CREATE INDEX "UserQuota_channelsTornDownAt_idx" ON "UserQuota" ("channelsTornDownAt");
