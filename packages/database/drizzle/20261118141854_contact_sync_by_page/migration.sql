CREATE TYPE "contactSyncActorType" AS ENUM('user', 'api_token');--> statement-breakpoint
CREATE TYPE "contactSyncMappingKind" AS ENUM('tag', 'customField');--> statement-breakpoint
CREATE TYPE "contactSyncMappingOrigin" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TYPE "contactSyncProvider" AS ENUM('ahachat');--> statement-breakpoint
CREATE TYPE "contactSyncRunItemStatus" AS ENUM('pending', 'running', 'succeeded', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "contactSyncRunStatus" AS ENUM('pending', 'running', 'cancelling', 'succeeded', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "contactSyncSourceChannel" AS ENUM('messenger', 'instagram', 'zalo', 'telegram');--> statement-breakpoint
CREATE TYPE "contactSyncTrigger" AS ENUM('menu', 'connect');--> statement-breakpoint
CREATE TYPE "contactSyncTriggerSource" AS ENUM('app', 'api');--> statement-breakpoint
CREATE TABLE "ContactSyncMapping" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"provider" "contactSyncProvider" NOT NULL,
	"channel" "contactSyncSourceChannel" NOT NULL,
	"pageId" text NOT NULL,
	"kind" "contactSyncMappingKind" NOT NULL,
	"externalId" text NOT NULL,
	"externalName" text NOT NULL,
	"tagId" bigint,
	"customFieldId" bigint,
	"origin" "contactSyncMappingOrigin" NOT NULL,
	CONSTRAINT "ContactSyncMapping_target_check" CHECK (("kind" = 'tag' AND "tagId" IS NOT NULL AND "customFieldId" IS NULL) OR ("kind" = 'customField' AND "customFieldId" IS NOT NULL AND "tagId" IS NULL)),
	CONSTRAINT "ContactSyncMapping_external_check" CHECK (btrim("externalId") <> '' AND btrim("externalName") <> '')
);
--> statement-breakpoint
CREATE TABLE "ContactSyncRunItem" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"runId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint,
	"sourceChannel" "contactSyncSourceChannel" NOT NULL,
	"sourceAccountId" text NOT NULL,
	"sourceAccountName" text,
	"position" integer NOT NULL,
	"status" "contactSyncRunItemStatus" NOT NULL,
	"cursor" text,
	"upperBoundId" text,
	"boundReadAt" timestamp(6) with time zone,
	"createdCount" integer NOT NULL,
	"updatedCount" integer NOT NULL,
	"skippedCount" integer NOT NULL,
	"failedCount" integer NOT NULL,
	"skippedValueCount" integer NOT NULL,
	"currentError" text,
	"startedAt" timestamp(6) with time zone,
	"finishedAt" timestamp(6) with time zone,
	"followUpCoexist" boolean NOT NULL,
	"followUpAiReadsSyncedHistory" boolean NOT NULL,
	"followUpRunId" bigint,
	"followUpError" text,
	"followUpRequestedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "ContactSyncRun" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"provider" "contactSyncProvider" NOT NULL,
	"status" "contactSyncRunStatus" NOT NULL,
	"triggerSource" "contactSyncTriggerSource" NOT NULL,
	"trigger" "contactSyncTrigger" NOT NULL,
	"requestedByType" "contactSyncActorType" NOT NULL,
	"requestedById" text NOT NULL,
	"syncTags" boolean NOT NULL,
	"syncCustomFields" boolean NOT NULL,
	"overwriteExisting" boolean NOT NULL,
	"startedAt" timestamp(6) with time zone,
	"finishedAt" timestamp(6) with time zone,
	"lastHeartbeatAt" timestamp(6) with time zone,
	"pausedUntil" timestamp(6) with time zone,
	"claimToken" text,
	"attempts" integer NOT NULL,
	"chunkSeq" integer NOT NULL,
	"currentError" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ContactSyncMapping_page_kind_externalId_key" ON "ContactSyncMapping" ("workspaceId","provider","channel","pageId","kind","externalId");--> statement-breakpoint
CREATE INDEX "ContactSyncMapping_tagId_idx" ON "ContactSyncMapping" ("tagId") WHERE "tagId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ContactSyncMapping_customFieldId_idx" ON "ContactSyncMapping" ("customFieldId") WHERE "customFieldId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ContactSyncRunItem_runId_position_key" ON "ContactSyncRunItem" ("runId","position");--> statement-breakpoint
CREATE INDEX "ContactSyncRunItem_workspaceId_idx" ON "ContactSyncRunItem" ("workspaceId");--> statement-breakpoint
CREATE INDEX "ContactSyncRunItem_inboxId_idx" ON "ContactSyncRunItem" ("inboxId") WHERE "inboxId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ContactSyncRunItem_followUp_pending_idx" ON "ContactSyncRunItem" ("followUpRequestedAt") WHERE "followUpCoexist" AND "followUpRunId" IS NULL AND "followUpError" IS NULL AND "status" NOT IN ('pending', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "ContactSyncRun_workspace_live_uq" ON "ContactSyncRun" ("workspaceId") WHERE status IN ('pending', 'running', 'cancelling');--> statement-breakpoint
CREATE INDEX "ContactSyncRun_workspace_createdAt_idx" ON "ContactSyncRun" ("workspaceId","createdAt" DESC);--> statement-breakpoint
CREATE INDEX "ContactSyncRun_live_idx" ON "ContactSyncRun" ("status","lastHeartbeatAt") WHERE status IN ('pending', 'running', 'cancelling');--> statement-breakpoint
ALTER TABLE "ContactSyncMapping" ADD CONSTRAINT "ContactSyncMapping_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactSyncMapping" ADD CONSTRAINT "ContactSyncMapping_tagId_Tag_id_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactSyncMapping" ADD CONSTRAINT "ContactSyncMapping_customFieldId_CustomField_id_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactSyncRunItem" ADD CONSTRAINT "ContactSyncRunItem_runId_ContactSyncRun_id_fkey" FOREIGN KEY ("runId") REFERENCES "ContactSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactSyncRunItem" ADD CONSTRAINT "ContactSyncRunItem_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactSyncRunItem" ADD CONSTRAINT "ContactSyncRunItem_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactSyncRun" ADD CONSTRAINT "ContactSyncRun_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;