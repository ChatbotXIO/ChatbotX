-- Consolidated WhatsApp-calling schema (squash of the original calling
-- migrations). This feature is NOT yet in production, so the calling objects
-- are DROPPED and recreated cleanly rather than guarded with idempotent
-- IF-NOT-EXISTS blocks — those would skip recreation and leave a diverged
-- local table stuck in its stale shape (missing new columns, keeping legacy
-- ones), which then breaks a later index/constraint. The DROPs use IF EXISTS
-- so this is still a no-op-then-create on a fresh database (CI / new dev).
--
-- The FreeSWITCH/SIP transport has been removed: calling now runs on VoIP
-- (WebRTC ↔ Meta) with Meta-native recording/transcription. The former SIP
-- tables (AgentSipPresence, UserSoftphoneCredential, WorkspaceSipNode), the
-- IntegrationWhatsapp `sip*` columns and the `sipProvisioningStatus` enum are
-- DROPPED here and NOT recreated.
--
-- On a fresh database (CI / new dev / production) this runs once and produces
-- the SIP-free schema. A dev database that had ALREADY applied an earlier
-- (SIP-carrying) version of THIS migration keeps that ledger row, so the
-- runner will NOT re-run it — those local SIP objects persist harmlessly
-- (nothing reads them) until the developer refreshes their schema. To clean an
-- existing local dev database, drop the ledger row and re-migrate:
--   DELETE FROM drizzle.__drizzle_migrations
--     WHERE name = '20260914150000_whatsapp_calling_consolidated';
--   pnpm --filter @chatbotx.io/database db:migrate
--
-- Calling data is disposable (test-only, pre-production): dropping the tables
-- discards any local call rows, which is intended.

-- ── drop existing calling objects (clean slate) ────────────────────────
DROP TABLE IF EXISTS "WhatsappCall" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "WhatsappCallPermission" CASCADE;--> statement-breakpoint
-- Retired SIP/softphone tables — dropped, never recreated.
DROP TABLE IF EXISTS "AgentSipPresence" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "UserSoftphoneCredential" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "WorkspaceSipNode" CASCADE;--> statement-breakpoint
-- Calling columns live on the shared IntegrationWhatsapp table (which we must
-- NOT drop) — drop the current + any legacy calling columns, re-added below.
-- The `sip*` columns are dropped and NOT re-added (SIP transport removed).
ALTER TABLE "IntegrationWhatsapp"
  DROP COLUMN IF EXISTS "callRecordingEnabled",
  DROP COLUMN IF EXISTS "callRecordingRetentionDays",
  DROP COLUMN IF EXISTS "callTranscriptionEnabled",
  DROP COLUMN IF EXISTS "callRecordingMode",
  DROP COLUMN IF EXISTS "callTranscriptionMode",
  DROP COLUMN IF EXISTS "callAnnouncementLanguage",
  DROP COLUMN IF EXISTS "callRecordingPurpose",
  DROP COLUMN IF EXISTS "sipProvisioningStatus",
  DROP COLUMN IF EXISTS "sipProvisioningClaim",
  DROP COLUMN IF EXISTS "sipProvisioningLeaseUntil",
  DROP COLUMN IF EXISTS "sipProvisionedAt",
  DROP COLUMN IF EXISTS "sipLastError",
  DROP COLUMN IF EXISTS "sipPasswordEncrypted",
  DROP COLUMN IF EXISTS "sipGatewayName",
  DROP COLUMN IF EXISTS "sipNodeId",
  DROP COLUMN IF EXISTS "callingRestriction";--> statement-breakpoint
DROP TYPE IF EXISTS "whatsappCallRecordingMode";--> statement-breakpoint
DROP TYPE IF EXISTS "whatsappCallTranscriptionMode";--> statement-breakpoint
DROP TYPE IF EXISTS "whatsappCallDirection";--> statement-breakpoint
DROP TYPE IF EXISTS "whatsappCallStatus";--> statement-breakpoint
DROP TYPE IF EXISTS "whatsappCallPermissionResponse";--> statement-breakpoint
DROP TYPE IF EXISTS "sipProvisioningStatus";--> statement-breakpoint

-- ── enums ──────────────────────────────────────────────────────────────
CREATE TYPE "whatsappCallRecordingMode" AS ENUM('metaNative', 'browserWhisper');--> statement-breakpoint
CREATE TYPE "whatsappCallTranscriptionMode" AS ENUM('metaNative', 'browserWhisper');--> statement-breakpoint
CREATE TYPE "whatsappCallDirection" AS ENUM('userInitiated', 'businessInitiated');--> statement-breakpoint
CREATE TYPE "whatsappCallStatus" AS ENUM('ringing', 'accepted', 'rejected', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "whatsappCallPermissionResponse" AS ENUM('accept', 'reject');--> statement-breakpoint

-- ── tables ─────────────────────────────────────────────────────────────
CREATE TABLE "WhatsappCall" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"wacid" text,
	"attemptId" text,
	"direction" "whatsappCallDirection" NOT NULL,
	"status" "whatsappCallStatus" DEFAULT 'ringing'::"whatsappCallStatus" NOT NULL,
	"startedAt" timestamp(6) with time zone,
	"endedAt" timestamp(6) with time zone,
	"durationSeconds" integer,
	"messageId" bigint,
	"lastError" text,
	"answeredByUserId" bigint,
	"initiatedByUserId" bigint,
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

-- ── calling columns on the shared IntegrationWhatsapp table ─────────────
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callRecordingEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callRecordingRetentionDays" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callTranscriptionEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callRecordingMode" "whatsappCallRecordingMode" DEFAULT 'metaNative'::"whatsappCallRecordingMode" NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callTranscriptionMode" "whatsappCallTranscriptionMode" DEFAULT 'metaNative'::"whatsappCallTranscriptionMode" NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callAnnouncementLanguage" text;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "callRecordingPurpose" text;--> statement-breakpoint

-- ── indexes ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "WhatsappCall_wacid_key" ON "WhatsappCall" ("wacid") WHERE "wacid" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappCall_attemptId_key" ON "WhatsappCall" ("attemptId") WHERE "attemptId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "WhatsappCall_workspaceId_idx" ON "WhatsappCall" ("workspaceId");--> statement-breakpoint
CREATE INDEX "WhatsappCall_conversationId_idx" ON "WhatsappCall" ("conversationId");--> statement-breakpoint
CREATE INDEX "WhatsappCall_contactInboxId_idx" ON "WhatsappCall" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "WhatsappCall_workspaceId_createdAt_idx" ON "WhatsappCall" ("workspaceId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "WhatsappCall_contactInboxId_createdAt_idx" ON "WhatsappCall" ("contactInboxId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "WhatsappCall_ringing_createdAt_idx" ON "WhatsappCall" ("createdAt") WHERE "status" = 'ringing';--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappCall_pendingOutbound_key" ON "WhatsappCall" ("inboxId","contactInboxId") WHERE "direction" = 'businessInitiated' AND "status" IN ('ringing', 'accepted');--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappCallPermission_contactInboxId_key" ON "WhatsappCallPermission" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "WhatsappCallPermission_workspaceId_idx" ON "WhatsappCallPermission" ("workspaceId");--> statement-breakpoint

-- ── foreign keys ───────────────────────────────────────────────────────
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_answeredByUserId_User_id_fkey" FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_initiatedByUserId_User_id_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCallPermission" ADD CONSTRAINT "WhatsappCallPermission_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCallPermission" ADD CONSTRAINT "WhatsappCallPermission_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
