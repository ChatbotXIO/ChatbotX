CREATE TYPE "commentAutomationEventStatus" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "commentAutomationReplyChannel" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "commentAutomationReplyType" AS ENUM('AIAgent', 'text', 'flow', 'none');--> statement-breakpoint
CREATE TABLE "FBCommentAutomationEvent" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"automationId" bigint NOT NULL,
	"contactId" bigint,
	"postId" text NOT NULL,
	"commentId" text NOT NULL,
	"commentText" text,
	"replyChannel" "commentAutomationReplyChannel" NOT NULL,
	"replyType" "commentAutomationReplyType" NOT NULL,
	"replyText" text,
	"status" "commentAutomationEventStatus" NOT NULL,
	"errorDetail" text,
	"httpCode" text,
	"occurredAt" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "FBCommentAutomationEvent_dedup_idx" ON "FBCommentAutomationEvent" ("automationId","commentId","replyChannel");--> statement-breakpoint
CREATE INDEX "FBCommentAutomationEvent_automation_occurredAt_idx" ON "FBCommentAutomationEvent" ("workspaceId","automationId","occurredAt" DESC);--> statement-breakpoint
CREATE INDEX "FBCommentAutomationEvent_contactId_idx" ON "FBCommentAutomationEvent" ("contactId");--> statement-breakpoint
CREATE INDEX "FBCommentAutomationEvent_createdAt_idx" ON "FBCommentAutomationEvent" ("createdAt");--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" ADD CONSTRAINT "FBCommentAutomationEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" ADD CONSTRAINT "FBCommentAutomationEvent_LOfdyJGW0vJy_fkey" FOREIGN KEY ("automationId") REFERENCES "FBCommentAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" ADD CONSTRAINT "FBCommentAutomationEvent_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;