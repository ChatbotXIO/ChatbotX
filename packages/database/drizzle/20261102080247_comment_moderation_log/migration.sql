CREATE TYPE "commentModerationAction" AS ENUM('hide', 'delete');--> statement-breakpoint
CREATE TYPE "commentModerationRule" AS ENUM('all', 'phoneNumber', 'link', 'keyword', 'image', 'video', 'gif', 'emoji');--> statement-breakpoint
CREATE TYPE "commentModerationSource" AS ENUM('rule', 'ai');--> statement-breakpoint
CREATE TYPE "commentModerationStatus" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
ALTER TYPE "commentAutomationMissReason" ADD VALUE 'moderated';--> statement-breakpoint
CREATE TABLE "CommentModerationLog" (
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
	"source" "commentModerationSource" NOT NULL,
	"rule" "commentModerationRule",
	"matchedKeyword" text,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"reason" text,
	"action" "commentModerationAction" NOT NULL,
	"status" "commentModerationStatus" DEFAULT 'pending'::"commentModerationStatus" NOT NULL,
	"errorDetail" text,
	"provider" text,
	"modelId" text,
	"occurredAt" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "CommentAutomation" ADD COLUMN "moderatedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "CommentModerationLog_dedup_idx" ON "CommentModerationLog" ("automationId","commentId");--> statement-breakpoint
CREATE INDEX "CommentModerationLog_workspace_automation_occurredAt_idx" ON "CommentModerationLog" ("workspaceId","automationId","occurredAt" DESC);--> statement-breakpoint
CREATE INDEX "CommentModerationLog_contactId_idx" ON "CommentModerationLog" ("contactId") WHERE "contactId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "CommentModerationLog_contactInboxId_idx" ON "CommentModerationLog" ("contactInboxId") WHERE "contactInboxId" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "CommentModerationLog" ADD CONSTRAINT "CommentModerationLog_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "CommentModerationLog" ADD CONSTRAINT "CommentModerationLog_automationId_CommentAutomation_id_fkey" FOREIGN KEY ("automationId") REFERENCES "CommentAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "CommentModerationLog" ADD CONSTRAINT "CommentModerationLog_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "CommentModerationLog" ADD CONSTRAINT "CommentModerationLog_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;