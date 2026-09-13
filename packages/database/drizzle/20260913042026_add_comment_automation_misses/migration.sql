DROP INDEX "FBCommentAutomationEvent_createdAt_idx";--> statement-breakpoint
CREATE INDEX "FBCommentAutomationEvent_failed_createdAt_idx" ON "FBCommentAutomationEvent" ("createdAt") WHERE "status" = 'failed';
CREATE TYPE "commentAutomationMissReason" AS ENUM('outsideSchedule', 'postNotMatched', 'commentIsReply', 'keywordsNotMatched', 'contactNotNew', 'alreadyRepliedOnPost', 'engagedOnOtherPost');--> statement-breakpoint
CREATE TABLE "FBCommentAutomationMiss" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"automationId" bigint NOT NULL,
	"contactId" bigint,
	"contactInboxId" bigint,
	"postId" text NOT NULL,
	"commentId" text NOT NULL,
	"commentText" text,
	"reason" "commentAutomationMissReason" NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "FBCommentAutomation" ADD COLUMN "missedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "FBCommentAutomationMiss_dedup_idx" ON "FBCommentAutomationMiss" ("automationId","commentId");--> statement-breakpoint
CREATE INDEX "FBCommentAutomationMiss_automation_occurredAt_idx" ON "FBCommentAutomationMiss" ("workspaceId","automationId","occurredAt" DESC);--> statement-breakpoint
CREATE INDEX "FBCommentAutomationMiss_contactId_idx" ON "FBCommentAutomationMiss" ("contactId");--> statement-breakpoint
CREATE INDEX "FBCommentAutomationMiss_contactInboxId_idx" ON "FBCommentAutomationMiss" ("contactInboxId");--> statement-breakpoint
ALTER TABLE "FBCommentAutomationMiss" ADD CONSTRAINT "FBCommentAutomationMiss_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationMiss" ADD CONSTRAINT "FBCommentAutomationMiss_4mfgnR9RsQNo_fkey" FOREIGN KEY ("automationId") REFERENCES "FBCommentAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationMiss" ADD CONSTRAINT "FBCommentAutomationMiss_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationMiss" ADD CONSTRAINT "FBCommentAutomationMiss_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
