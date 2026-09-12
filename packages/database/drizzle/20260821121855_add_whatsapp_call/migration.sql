CREATE TYPE "whatsappCallDirection" AS ENUM('userInitiated', 'businessInitiated');--> statement-breakpoint
CREATE TYPE "whatsappCallStatus" AS ENUM('ringing', 'accepted', 'rejected', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "WhatsappCall" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"wacid" text NOT NULL,
	"direction" "whatsappCallDirection" NOT NULL,
	"status" "whatsappCallStatus" DEFAULT 'ringing'::"whatsappCallStatus" NOT NULL,
	"startedAt" timestamp(6) with time zone,
	"endedAt" timestamp(6) with time zone,
	"durationSeconds" integer,
	"messageId" bigint,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"conversationId" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappCall_wacid_key" ON "WhatsappCall" ("wacid");--> statement-breakpoint
CREATE INDEX "WhatsappCall_workspaceId_idx" ON "WhatsappCall" ("workspaceId");--> statement-breakpoint
CREATE INDEX "WhatsappCall_conversationId_idx" ON "WhatsappCall" ("conversationId");--> statement-breakpoint
CREATE INDEX "WhatsappCall_contactInboxId_idx" ON "WhatsappCall" ("contactInboxId");--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;