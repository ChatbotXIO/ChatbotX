CREATE TYPE "whatsappCallRecordingMode" AS ENUM('metaNative', 'browserWhisper');--> statement-breakpoint
CREATE TYPE "whatsappCallTranscriptionMode" AS ENUM('metaNative', 'browserWhisper');--> statement-breakpoint
CREATE TYPE "whatsappCallDirection" AS ENUM('userInitiated', 'businessInitiated');--> statement-breakpoint
CREATE TYPE "whatsappCallStatus" AS ENUM('ringing', 'accepted', 'rejected', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "whatsappCallOutcome" AS ENUM('completed', 'failed', 'rejected', 'canceled');--> statement-breakpoint
CREATE TYPE "whatsappCallPermissionResponse" AS ENUM('accept', 'reject');--> statement-breakpoint
CREATE TABLE "WhatsappCall" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"wacid" text,
	"attemptId" text,
	"direction" "whatsappCallDirection" NOT NULL,
	"status" "whatsappCallStatus" DEFAULT 'ringing'::"whatsappCallStatus" NOT NULL,
	"outcome" "whatsappCallOutcome",
	"startedAt" timestamp(6) with time zone,
	"endedAt" timestamp(6) with time zone,
	"durationSeconds" integer,
	"messageId" bigint,
	"lastError" text,
	"answeredByUserId" bigint,
	"initiatedByUserId" bigint,
	"recordingRequested" boolean,
	"recordingFailureReason" text,
	"recordingPath" text,
	"recordedAt" timestamp(6) with time zone,
	"transcript" text,
	"transcribedAt" timestamp(6) with time zone,
	"transcriptSegments" jsonb,
	"aiSummary" jsonb,
	"aiSummarizedAt" timestamp(6) with time zone,
	"aiSummaryProvider" text,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"conversationId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WhatsappCallPermission" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"response" "whatsappCallPermissionResponse" NOT NULL,
	"isPermanent" boolean DEFAULT false NOT NULL,
	"expiresAt" timestamp(6) with time zone,
	"respondedAt" timestamp(6) with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callingEnabled" boolean;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "inboundCallsEnabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callHours" jsonb;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callRecordingEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callRecordingRetentionDays" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callTranscriptionEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callRecordingMode" "whatsappCallRecordingMode" DEFAULT 'metaNative'::"whatsappCallRecordingMode" NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callTranscriptionMode" "whatsappCallTranscriptionMode" DEFAULT 'metaNative'::"whatsappCallTranscriptionMode" NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callAnnouncementLanguage" text;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callRecordingPurpose" text;--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappCall_wacid_key" ON "WhatsappCall" ("wacid") WHERE "wacid" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappCall_attemptId_key" ON "WhatsappCall" ("attemptId") WHERE "attemptId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "WhatsappCall_workspaceId_idx" ON "WhatsappCall" ("workspaceId");--> statement-breakpoint
CREATE INDEX "WhatsappCall_conversationId_idx" ON "WhatsappCall" ("conversationId");--> statement-breakpoint
CREATE INDEX "WhatsappCall_contactInboxId_idx" ON "WhatsappCall" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "WhatsappCall_workspaceId_createdAt_id_idx" ON "WhatsappCall" ("workspaceId","createdAt" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "WhatsappCall_contactInboxId_createdAt_idx" ON "WhatsappCall" ("contactInboxId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "WhatsappCall_ringing_createdAt_idx" ON "WhatsappCall" ("createdAt") WHERE "status" = 'ringing';--> statement-breakpoint
CREATE INDEX "WhatsappCall_resumableRinging_idx" ON "WhatsappCall" ("workspaceId","createdAt" DESC NULLS LAST) WHERE "status" = 'ringing' AND "wacid" IS NOT NULL AND "answeredByUserId" IS NULL;--> statement-breakpoint
CREATE INDEX "WhatsappCall_recording_inboxId_recordedAt_idx" ON "WhatsappCall" ("inboxId","recordedAt") WHERE "recordingPath" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappCall_pendingOutbound_key" ON "WhatsappCall" ("inboxId","contactInboxId") WHERE "direction" = 'businessInitiated' AND "status" IN ('ringing', 'accepted');--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappCallPermission_contactInboxId_key" ON "WhatsappCallPermission" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "WhatsappCallPermission_workspaceId_idx" ON "WhatsappCallPermission" ("workspaceId");--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_answeredByUserId_User_id_fkey" FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_initiatedByUserId_User_id_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCallPermission" ADD CONSTRAINT "WhatsappCallPermission_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCallPermission" ADD CONSTRAINT "WhatsappCallPermission_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkspaceMember" ADD COLUMN "onlineSince" timestamp(6) with time zone;
