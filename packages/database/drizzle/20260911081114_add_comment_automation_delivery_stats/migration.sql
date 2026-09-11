ALTER TABLE "FBCommentAutomation" ADD COLUMN "sentCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "FBCommentAutomation" ADD COLUMN "deliveredCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "FBCommentAutomation" ADD COLUMN "seenCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "FBCommentAutomation" ADD COLUMN "clickedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "FBCommentAutomation" ADD COLUMN "failedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" ADD COLUMN "contactInboxId" bigint;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" ADD COLUMN "deliveredAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" ADD COLUMN "seenAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" ADD COLUMN "clickedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" ADD COLUMN "failedAt" timestamp(6) with time zone;--> statement-breakpoint
CREATE INDEX "FBCommentAutomationEvent_contactInboxId_idx" ON "FBCommentAutomationEvent" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "FBCommentAutomationEvent_private_unseen_idx" ON "FBCommentAutomationEvent" ("contactInboxId") WHERE "replyChannel" = 'private' AND "deliveredAt" IS NOT NULL AND "seenAt" IS NULL;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" ADD CONSTRAINT "FBCommentAutomationEvent_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;