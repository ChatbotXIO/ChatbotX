ALTER TABLE "Inbox" ADD COLUMN "disconnectedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Inbox" ADD COLUMN "disconnectReason" text;