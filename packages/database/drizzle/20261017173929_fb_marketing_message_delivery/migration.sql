CREATE TABLE "FacebookMarketingMessageRecipient" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"campaignRowId" bigint NOT NULL,
	"subscriptionToken" text NOT NULL,
	"psid" text,
	"mid" text,
	"trackingId" text,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"nextAttemptAt" timestamp(6) with time zone,
	"nextEligibleAt" timestamp(6) with time zone,
	"sentAt" timestamp(6) with time zone,
	"deliveredAt" timestamp(6) with time zone,
	"failedAt" timestamp(6) with time zone,
	"errorCode" integer,
	"errorMessage" text,
	"errorSource" text
);
--> statement-breakpoint
-- Rows that predate delivery backfill to 'notSent' (they send only via an explicit send); new rows default to 'scheduled'.
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "status" text DEFAULT 'notSent' NOT NULL;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ALTER COLUMN "status" SET DEFAULT 'scheduled';--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "statusReason" text;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "statusErrorCode" integer;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "statusErrorMessage" text;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "startsAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "startedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "firstSentAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "completedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "nextDayAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "metaEndsAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "timezoneName" text;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "adSetId" text;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "tokenCount" integer;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "dayTarget" integer;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "daySent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "resumeCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "FacebookMarketingMessage_status_startsAt_idx" ON "FacebookMarketingMessage" ("status","startsAt");--> statement-breakpoint
CREATE UNIQUE INDEX "FacebookMarketingMessageRecipient_campaign_token_key" ON "FacebookMarketingMessageRecipient" ("campaignRowId","subscriptionToken");--> statement-breakpoint
CREATE INDEX "FacebookMarketingMessageRecipient_trackingId_idx" ON "FacebookMarketingMessageRecipient" ("trackingId");--> statement-breakpoint
CREATE INDEX "FacebookMarketingMessageRecipient_due_idx" ON "FacebookMarketingMessageRecipient" ("campaignRowId","nextAttemptAt","id") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessageRecipient" ADD CONSTRAINT "FacebookMarketingMessageRecipient_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessageRecipient" ADD CONSTRAINT "FacebookMarketingMessageRecipient_JpRpjGJ419Rs_fkey" FOREIGN KEY ("campaignRowId") REFERENCES "FacebookMarketingMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;