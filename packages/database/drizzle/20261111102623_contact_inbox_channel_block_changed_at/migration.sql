ALTER TABLE "ContactInbox" ADD COLUMN "channelBlockChangedAt" timestamp(6) with time zone;--> statement-breakpoint
UPDATE "ContactInbox" SET "channelBlockChangedAt" = "channelBlockedAt" WHERE "channelBlockedAt" IS NOT NULL;
