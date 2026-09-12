DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'sipProvisioningStatus' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "sipProvisioningStatus" AS ENUM('none', 'provisioning', 'provisioned', 'enabled', 'failed');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AgentSipPresence" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"userId" bigint NOT NULL,
	"contact" text,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"lastRungAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserSoftphoneCredential" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"userId" bigint NOT NULL,
	"sipUsername" text NOT NULL,
	"passwordEncrypted" jsonb NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"revokedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "WorkspaceSipNode" (
	"workspaceId" bigint PRIMARY KEY,
	"nodeId" text NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "WhatsappCall_livekitRoomName_idx";--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "callRecordingRetentionDays" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "callTranscriptionEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "sipProvisioningStatus" "sipProvisioningStatus" DEFAULT 'none'::"sipProvisioningStatus" NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "sipProvisioningClaim" text;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "sipProvisioningLeaseUntil" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "sipProvisionedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "sipLastError" text;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "sipPasswordEncrypted" jsonb;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "sipGatewayName" text;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "sipNodeId" text;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD COLUMN IF NOT EXISTS "attemptId" text;--> statement-breakpoint
-- Renamed in place (not dropped+recreated) so existing in-app-call rows keep
-- their room/channel id column under the new FreeSWITCH name. Guarded so a
-- re-run after a partial failure is a no-op once the rename has happened.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WhatsappCall' AND column_name = 'livekitRoomName'
  ) THEN
    ALTER TABLE "WhatsappCall" RENAME COLUMN "livekitRoomName" TO "freeswitchUuid";
  END IF;
END $$;--> statement-breakpoint
-- Legacy LiveKit room names are not FreeSWITCH channel uuids and were never
-- unique per row; clear them so the partial UNIQUE index below cannot fail
-- on a live table and no legacy value can ever collide with a real uuid.
UPDATE "WhatsappCall" SET "freeswitchUuid" = NULL WHERE "freeswitchUuid" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD COLUMN IF NOT EXISTS "freeswitchBLegUuid" text;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD COLUMN IF NOT EXISTS "lastError" text;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD COLUMN IF NOT EXISTS "answeredByUserId" bigint;--> statement-breakpoint
ALTER TABLE "WhatsappCall" ALTER COLUMN "wacid" DROP NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "WhatsappCall_wacid_key";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappCall_wacid_key" ON "WhatsappCall" ("wacid") WHERE "wacid" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "AgentSipPresence_workspaceId_userId_key" ON "AgentSipPresence" ("workspaceId","userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentSipPresence_ring_idx" ON "AgentSipPresence" ("workspaceId","expiresAt" DESC NULLS LAST,"lastRungAt" NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationWhatsapp_sipGatewayName_key" ON "IntegrationWhatsapp" ("sipGatewayName") WHERE "sipGatewayName" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserSoftphoneCredential_sipUsername_key" ON "UserSoftphoneCredential" ("sipUsername");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserSoftphoneCredential_workspaceId_userId_key" ON "UserSoftphoneCredential" ("workspaceId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappCall_attemptId_key" ON "WhatsappCall" ("attemptId") WHERE "attemptId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappCall_freeswitchUuid_key" ON "WhatsappCall" ("freeswitchUuid") WHERE "freeswitchUuid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WhatsappCall_freeswitchBLegUuid_idx" ON "WhatsappCall" ("freeswitchBLegUuid") WHERE "freeswitchBLegUuid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WhatsappCall_workspaceId_createdAt_idx" ON "WhatsappCall" ("workspaceId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WhatsappCall_contactInboxId_createdAt_idx" ON "WhatsappCall" ("contactInboxId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "WhatsappCall_ringing_createdAt_idx" ON "WhatsappCall" ("createdAt") WHERE "status" = 'ringing';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappCall_pendingOutbound_key" ON "WhatsappCall" ("inboxId","contactInboxId") WHERE "direction" = 'businessInitiated' AND "status" IN ('ringing', 'accepted');--> statement-breakpoint
ALTER TABLE "AgentSipPresence" DROP CONSTRAINT IF EXISTS "AgentSipPresence_workspaceId_Workspace_id_fkey";--> statement-breakpoint
ALTER TABLE "AgentSipPresence" ADD CONSTRAINT "AgentSipPresence_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentSipPresence" DROP CONSTRAINT IF EXISTS "AgentSipPresence_userId_User_id_fkey";--> statement-breakpoint
ALTER TABLE "AgentSipPresence" ADD CONSTRAINT "AgentSipPresence_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "UserSoftphoneCredential" DROP CONSTRAINT IF EXISTS "UserSoftphoneCredential_workspaceId_Workspace_id_fkey";--> statement-breakpoint
ALTER TABLE "UserSoftphoneCredential" ADD CONSTRAINT "UserSoftphoneCredential_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "UserSoftphoneCredential" DROP CONSTRAINT IF EXISTS "UserSoftphoneCredential_userId_User_id_fkey";--> statement-breakpoint
ALTER TABLE "UserSoftphoneCredential" ADD CONSTRAINT "UserSoftphoneCredential_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCall" DROP CONSTRAINT IF EXISTS "WhatsappCall_answeredByUserId_User_id_fkey";--> statement-breakpoint
ALTER TABLE "WhatsappCall" ADD CONSTRAINT "WhatsappCall_answeredByUserId_User_id_fkey" FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkspaceSipNode" DROP CONSTRAINT IF EXISTS "WorkspaceSipNode_workspaceId_Workspace_id_fkey";--> statement-breakpoint
ALTER TABLE "WorkspaceSipNode" ADD CONSTRAINT "WorkspaceSipNode_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;