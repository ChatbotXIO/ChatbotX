-- DROP CONSTRAINT / CREATE INDEX take blocking locks; fail fast instead of
-- hanging the deploy if another transaction holds a conflicting lock.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "MessageCleanupStatus" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "MessageCleanup" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"sourceId" text NOT NULL,
	"conversationIds" jsonb NOT NULL,
	"sinceTime" timestamp(6) with time zone,
	"deletedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"status" "MessageCleanupStatus" DEFAULT 'pending'::"MessageCleanupStatus" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"processedAt" timestamp(6) with time zone
);
--> statement-breakpoint
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_workspaceId_Workspace_id_fkey";--> statement-breakpoint
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_conversationId_Conversation_id_fkey";--> statement-breakpoint
ALTER TABLE "Message" DROP CONSTRAINT "Message_conversationId_Conversation_id_fkey";--> statement-breakpoint
ALTER TABLE "Message" DROP CONSTRAINT "Message_contactInboxId_ContactInbox_id_fkey";--> statement-breakpoint
ALTER TABLE "Message" DROP CONSTRAINT "Message_workspaceId_Workspace_id_fkey";--> statement-breakpoint
CREATE INDEX "AIConversationEmbedding_conversationId_idx" ON "AIConversationEmbedding" ("conversationId");--> statement-breakpoint
CREATE INDEX "AIConversationSource_conversationId_idx" ON "AIConversationSource" ("conversationId");--> statement-breakpoint
CREATE INDEX "ContactNote_contactId_idx" ON "ContactNote" ("contactId");--> statement-breakpoint
CREATE INDEX "ContactOnSmartDelay_conversationId_idx" ON "ContactOnSmartDelay" ("conversationId");--> statement-breakpoint
CREATE INDEX "FBCommentAutomationReply_contactId_idx" ON "FBCommentAutomationReply" ("contactId");--> statement-breakpoint
CREATE INDEX "FlowRun_conversationId_idx" ON "FlowRun" ("conversationId");--> statement-breakpoint
CREATE UNIQUE INDEX "MessageCleanup_inboxId_sourceId_key" ON "MessageCleanup" ("inboxId","sourceId");--> statement-breakpoint
CREATE INDEX "MessageCleanup_status_createdAt_idx" ON "MessageCleanup" ("status","createdAt");--> statement-breakpoint
CREATE INDEX "MessageCleanup_workspaceId_idx" ON "MessageCleanup" ("workspaceId");--> statement-breakpoint
CREATE INDEX "SequenceDispatch_contactId_idx" ON "SequenceDispatch" ("contactId");--> statement-breakpoint
CREATE INDEX "TriggerExecution_contactId_idx" ON "TriggerExecution" ("contactId");--> statement-breakpoint
CREATE INDEX "WebhookExecution_contactId_idx" ON "WebhookExecution" ("contactId");