-- Template versioning: Template.version/payloadHash and the append-only
-- TemplateVersion history.
ALTER TABLE "Template" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "Template" ADD COLUMN "payloadHash" text;
--> statement-breakpoint
CREATE TABLE "TemplateVersion" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"templateId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"payloadHash" text NOT NULL,
	"formatVersion" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "TemplateVersion_templateId_version_key" ON "TemplateVersion" ("templateId","version");
--> statement-breakpoint
CREATE INDEX "TemplateVersion_workspaceId_idx" ON "TemplateVersion" ("workspaceId");
--> statement-breakpoint
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_Template_id_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
-- Backfill: every live template gets its current payload as version 1 (the id
-- is reused: it is unique in this new table and needs no generator). The
-- template's `payloadHash` stays NULL, so its first save after deploy records
-- a fresh semantic hash and advances to version 2 once.
INSERT INTO "TemplateVersion" ("id", "templateId", "workspaceId", "version", "payload", "payloadHash", "formatVersion", "createdAt", "updatedAt")
SELECT "id", "id", "workspaceId", 1, "payload", md5("payload"::text), "formatVersion", now(), now()
FROM "Template"
WHERE "deletedAt" IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- One row per uninstall request (its counts, its one audit summary).
CREATE TABLE "TemplateUninstallOperation" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"templateId" bigint,
	"publisherRef" text NOT NULL,
	"requestedByKind" text NOT NULL,
	"requestedBy" bigint,
	"state" "templateUninstallOperationState" DEFAULT 'pending'::"templateUninstallOperationState" NOT NULL,
	"counts" jsonb,
	"auditLogId" text NOT NULL,
	"noticeDeliveredAt" timestamp(6) with time zone,
	"finishedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE INDEX "TemplateUninstallOperation_workspaceId_idx" ON "TemplateUninstallOperation" ("workspaceId");
--> statement-breakpoint
CREATE INDEX "TemplateUninstallOperation_templateId_idx" ON "TemplateUninstallOperation" ("templateId");
--> statement-breakpoint
CREATE INDEX "TemplateUninstallOperation_requestedBy_idx" ON "TemplateUninstallOperation" ("requestedBy");
--> statement-breakpoint
CREATE INDEX "TemplateUninstallOperation_notice_idx" ON "TemplateUninstallOperation" ("state","noticeDeliveredAt");
--> statement-breakpoint
ALTER TABLE "TemplateUninstallOperation" ADD CONSTRAINT "TemplateUninstallOperation_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateUninstallOperation" ADD CONSTRAINT "TemplateUninstallOperation_templateId_Template_id_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateUninstallOperation" ADD CONSTRAINT "TemplateUninstallOperation_requestedBy_User_id_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
-- TemplateInstallation: install outbox (claim/lease), per-item lock provenance,
-- version pinning, publisher uninstall, actor kind.
ALTER TABLE "TemplateInstallation" ADD COLUMN "claimToken" text;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "claimedAt" timestamp(6) with time zone;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "errorCode" text;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "sourceTemplateId" bigint;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "successfulInstallEvents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "sourceDeletedAt" timestamp(6) with time zone;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "inboxBindings" jsonb;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "sourceVersion" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "lastSyncedAt" timestamp(6) with time zone;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "publisherRef" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "publisherUninstallGrant" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstalledAt" timestamp(6) with time zone;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstalledByKind" text;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstallCounts" jsonb;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "installedByKind" text DEFAULT 'apiToken' NOT NULL;
--> statement-breakpoint
CREATE INDEX "TemplateInstallation_status_claimedAt_idx" ON "TemplateInstallation" ("status","claimedAt");
--> statement-breakpoint
CREATE INDEX "TemplateInstallation_templateId_publisherRef_idx" ON "TemplateInstallation" ("templateId","publisherRef");
--> statement-breakpoint
CREATE INDEX "TemplateInstallation_sourceTemplateId_idx" ON "TemplateInstallation" ("sourceTemplateId");
--> statement-breakpoint
-- Backfill: provenance and the installs that already succeeded.
UPDATE "TemplateInstallation" SET "sourceTemplateId" = "templateId" WHERE "sourceTemplateId" IS NULL;
--> statement-breakpoint
UPDATE "TemplateInstallation" SET "successfulInstallEvents" = 1 WHERE "status" IN ('completed', 'partial');
--> statement-breakpoint
UPDATE "TemplateInstallation" AS i SET "sourceDeletedAt" = COALESCE(t."deletedAt", now()) FROM "Template" AS t WHERE t."id" = i."templateId" AND t."deletedAt" IS NOT NULL;
--> statement-breakpoint
UPDATE "TemplateInstallation" SET "sourceDeletedAt" = now() WHERE "templateId" IS NULL AND "sourceDeletedAt" IS NULL;
--> statement-breakpoint
-- Backfill: before this change the only way to create a TemplateInstallation
-- was the builder's install action, which always stored the installing
-- member's id; a workspace API token could not install. So every row that
-- exists when this runs belonged to a member (a null "installedBy" is a member
-- whose user was deleted later, FK ON DELETE SET NULL), never to a token.
-- Marking them all 'member' makes their automatic updates fail closed
-- (templateInstallerAccessLost) instead of running with full API-token power.
-- Rows created by token installs after this deploy carry 'apiToken' explicitly.
UPDATE "TemplateInstallation" SET "installedByKind" = 'member';
--> statement-breakpoint
-- Backfill: one random reference per (template, target workspace) pair, so every
-- installation row of a pair shares it. Legacy installations get no uninstall
-- grant (the column default 0): the installer has to opt in.
UPDATE "TemplateInstallation" ti
SET "publisherRef" = pairs."ref"
FROM (
  SELECT "sourceTemplateId", "workspaceId",
         md5(random()::text || clock_timestamp()::text || "workspaceId"::text) AS "ref"
  FROM "TemplateInstallation"
  WHERE "sourceTemplateId" IS NOT NULL
  GROUP BY "sourceTemplateId", "workspaceId"
) pairs
WHERE ti."sourceTemplateId" = pairs."sourceTemplateId"
  AND ti."workspaceId" = pairs."workspaceId"
  AND ti."publisherRef" = '';
--> statement-breakpoint
-- At most one in-flight install per (workspace, template): supersede older
-- duplicates, then enforce it.
UPDATE "TemplateInstallation" SET "status" = 'failed', "errorCode" = 'templateInstallSuperseded', "completedAt" = now() WHERE "status" IN ('pending', 'installing') AND "id" NOT IN (SELECT DISTINCT ON ("workspaceId", "sourceTemplateId") "id" FROM "TemplateInstallation" WHERE "status" IN ('pending', 'installing') ORDER BY "workspaceId", "sourceTemplateId", "createdAt" DESC, "id" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX "TemplateInstallation_workspaceId_sourceTemplateId_active_key" ON "TemplateInstallation" ("workspaceId","sourceTemplateId") WHERE "status" IN ('pending', 'installing');
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstallState" "templateUninstallState" DEFAULT 'none'::"templateUninstallState" NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstallRequestedByKind" text;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstallRequestedBy" bigint;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstallRequestedAt" timestamp(6) with time zone;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstallAttempt" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstallClaimToken" text;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstallClaimedAt" timestamp(6) with time zone;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstallErrorCode" text;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "uninstallOperationId" bigint;
--> statement-breakpoint
CREATE INDEX "TemplateInstallation_uninstallRequestedBy_idx" ON "TemplateInstallation" ("uninstallRequestedBy");
--> statement-breakpoint
CREATE INDEX "TemplateInstallation_uninstallOperationId_idx" ON "TemplateInstallation" ("uninstallOperationId");
--> statement-breakpoint
CREATE INDEX "TemplateInstallation_uninstallState_claimedAt_idx" ON "TemplateInstallation" ("uninstallState","uninstallClaimedAt") WHERE "uninstallState" IN ('pending', 'running');
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD CONSTRAINT "TemplateInstallation_uninstallRequestedBy_User_id_fkey" FOREIGN KEY ("uninstallRequestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD CONSTRAINT "TemplateInstallation_jgQpmfUEHTMJ_fkey" FOREIGN KEY ("uninstallOperationId") REFERENCES "TemplateUninstallOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
-- A hard delete of a Template (a workspace purge cascading to its templates)
-- nulls TemplateInstallation.templateId through the FK but never stamped
-- sourceDeletedAt, which the sync and lock logic read. Stamp it in the same
-- statement as the delete, for every installation of the template.
CREATE OR REPLACE FUNCTION "template_stamp_installations_source_deleted"()
RETURNS trigger AS $$
BEGIN
  UPDATE "TemplateInstallation"
  SET "sourceDeletedAt" = now()
  WHERE "sourceTemplateId" = OLD."id"
    AND "sourceDeletedAt" IS NULL;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "Template_stamp_installations_source_deleted" ON "Template";
--> statement-breakpoint
CREATE TRIGGER "Template_stamp_installations_source_deleted"
BEFORE DELETE ON "Template"
FOR EACH ROW EXECUTE FUNCTION "template_stamp_installations_source_deleted"();
--> statement-breakpoint
-- Installations whose template was already hard-deleted before the trigger existed.
UPDATE "TemplateInstallation"
SET "sourceDeletedAt" = now()
WHERE "templateId" IS NULL
  AND "sourceTemplateId" IS NOT NULL
  AND "sourceDeletedAt" IS NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "pendingPublishEffects" jsonb;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "stagingGeneration" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "stagedCleanedGeneration" integer DEFAULT -1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "stagedCleanupClaimedAt" timestamp(6) with time zone;
--> statement-breakpoint
CREATE INDEX "TemplateInstallation_pendingPublishEffects_updatedAt_idx" ON "TemplateInstallation" ("updatedAt") WHERE "pendingPublishEffects" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "TemplateInstallation_stagedCleanupOwed_updatedAt_idx" ON "TemplateInstallation" ("updatedAt") WHERE (("status" = 'failed' AND "stagedCleanedGeneration" < "stagingGeneration") OR ("status" <> 'failed' AND "stagedCleanedGeneration" < "stagingGeneration" - 1));
--> statement-breakpoint
-- TemplateInstalledResource: per-item View/Edit lock, detach marker, sync tracking.
-- (The dedupe + unique index is the separate non-transactional migration after
-- the sync tables.)
ALTER TABLE "TemplateInstalledResource" ADD COLUMN "allowEdit" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD COLUMN "allowDelete" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD COLUMN "detachedAt" timestamp(6) with time zone;
--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD COLUMN "syncedHash" text;
--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD COLUMN "syncedVersion" integer;
--> statement-breakpoint
CREATE INDEX "TemplateInstalledResource_active_lookup_idx" ON "TemplateInstalledResource" ("workspaceId","resourceKind","resourceId") WHERE "wasExisting" = false AND "detachedAt" IS NULL;
--> statement-breakpoint
UPDATE "TemplateInstalledResource" AS r SET "allowEdit" = COALESCE((i."permissions"->>'allowEdit')::boolean, true), "allowDelete" = COALESCE((i."permissions"->>'allowDelete')::boolean, true) FROM "TemplateInstallation" AS i WHERE i."id" = r."installationId" AND r."wasExisting" = false;
--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD COLUMN "uninstallOutcome" text;
--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD COLUMN "uninstallEffects" jsonb;
--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD COLUMN "uninstallEffectsAttempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX "TemplateInstalledResource_pending_effects_idx" ON "TemplateInstalledResource" ("uninstallEffectsAttempts","id") WHERE "uninstallEffects" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD COLUMN "uninstallFrozenFrom" jsonb;
--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD COLUMN "uninstallDrainStartedAt" timestamp(6) with time zone;
--> statement-breakpoint
CREATE TABLE "TemplateInstallationSync" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"installationId" bigint NOT NULL,
	"requestedBy" bigint,
	"requestedByKind" text DEFAULT 'apiToken' NOT NULL,
	"status" "templateSyncStatus" DEFAULT 'pending'::"templateSyncStatus" NOT NULL,
	"trigger" "templateSyncTrigger" NOT NULL,
	"requestedVersion" integer NOT NULL,
	"idempotencyKey" text,
	"claimToken" text,
	"claimedAt" timestamp(6) with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"errorCode" text,
	"fromVersion" integer,
	"appliedVersion" integer,
	"appliedHash" text,
	"counts" jsonb,
	"warnings" jsonb DEFAULT '[]' NOT NULL,
	"warningSummary" jsonb,
	"startedAt" timestamp(6) with time zone,
	"finishedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "TemplateResourceBackup" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"installationId" bigint NOT NULL,
	"syncId" bigint NOT NULL,
	"installedResourceId" bigint NOT NULL,
	"resourceKind" text NOT NULL,
	"resourceId" bigint NOT NULL,
	"formatVersion" integer NOT NULL,
	"content" jsonb NOT NULL,
	"byteSize" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "TemplateInstallationSync_workspaceId_idx" ON "TemplateInstallationSync" ("workspaceId");
--> statement-breakpoint
CREATE INDEX "TemplateInstallationSync_installationId_idx" ON "TemplateInstallationSync" ("installationId");
--> statement-breakpoint
CREATE UNIQUE INDEX "TemplateInstallationSync_auto_active_key" ON "TemplateInstallationSync" ("installationId","requestedVersion") WHERE "trigger" = 'autoUpdate' AND "status" IN ('pending', 'running');
--> statement-breakpoint
CREATE UNIQUE INDEX "TemplateInstallationSync_idempotency_key" ON "TemplateInstallationSync" ("installationId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "TemplateInstallationSync_status_claimedAt_idx" ON "TemplateInstallationSync" ("status","claimedAt");
--> statement-breakpoint
CREATE INDEX "TemplateResourceBackup_workspaceId_idx" ON "TemplateResourceBackup" ("workspaceId");
--> statement-breakpoint
CREATE INDEX "TemplateResourceBackup_installationId_idx" ON "TemplateResourceBackup" ("installationId");
--> statement-breakpoint
CREATE INDEX "TemplateResourceBackup_syncId_idx" ON "TemplateResourceBackup" ("syncId");
--> statement-breakpoint
CREATE INDEX "TemplateResourceBackup_installedResourceId_idx" ON "TemplateResourceBackup" ("installedResourceId");
--> statement-breakpoint
ALTER TABLE "TemplateInstallationSync" ADD CONSTRAINT "TemplateInstallationSync_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateInstallationSync" ADD CONSTRAINT "TemplateInstallationSync_FDCAZLsj6sha_fkey" FOREIGN KEY ("installationId") REFERENCES "TemplateInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateResourceBackup" ADD CONSTRAINT "TemplateResourceBackup_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateResourceBackup" ADD CONSTRAINT "TemplateResourceBackup_mhH3iOmsXeXF_fkey" FOREIGN KEY ("installationId") REFERENCES "TemplateInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateResourceBackup" ADD CONSTRAINT "TemplateResourceBackup_syncId_TemplateInstallationSync_id_fkey" FOREIGN KEY ("syncId") REFERENCES "TemplateInstallationSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateResourceBackup" ADD CONSTRAINT "TemplateResourceBackup_6ze53IE5Y2X5_fkey" FOREIGN KEY ("installedResourceId") REFERENCES "TemplateInstalledResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
CREATE INDEX "TemplateInstallationSync_requestedBy_idx" ON "TemplateInstallationSync" ("requestedBy");
--> statement-breakpoint
ALTER TABLE "TemplateInstallationSync" ADD CONSTRAINT "TemplateInstallationSync_requestedBy_User_id_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateInstallationSync" ADD COLUMN "requestFingerprint" text;
--> statement-breakpoint
CREATE TYPE "templateInstallSource" AS ENUM('manual', 'tenantDefault');--> statement-breakpoint
CREATE TABLE "TenantDefaultTemplate" (
	"tenantId" bigint PRIMARY KEY,
	"templateId" bigint NOT NULL,
	"keyHash" text NOT NULL,
	"encryptedKey" jsonb NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "installSource" "templateInstallSource" DEFAULT 'manual'::"templateInstallSource" NOT NULL;--> statement-breakpoint
CREATE INDEX "TenantDefaultTemplate_templateId_idx" ON "TenantDefaultTemplate" ("templateId");--> statement-breakpoint
ALTER TABLE "TenantDefaultTemplate" ADD CONSTRAINT "TenantDefaultTemplate_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TenantDefaultTemplate" ADD CONSTRAINT "TenantDefaultTemplate_templateId_Template_id_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
CREATE TYPE "tenantDefaultTemplateAction" AS ENUM('set', 'cleared');--> statement-breakpoint
CREATE TABLE "TenantDefaultTemplateEvent" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"tenantId" bigint NOT NULL,
	"action" "tenantDefaultTemplateAction" NOT NULL,
	"templateId" bigint NOT NULL,
	"actorUserId" bigint
);
--> statement-breakpoint
CREATE INDEX "TenantDefaultTemplateEvent_tenantId_createdAt_idx" ON "TenantDefaultTemplateEvent" ("tenantId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "TenantDefaultTemplateEvent_actorUserId_idx" ON "TenantDefaultTemplateEvent" ("actorUserId");--> statement-breakpoint
ALTER TABLE "TenantDefaultTemplateEvent" ADD CONSTRAINT "TenantDefaultTemplateEvent_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TenantDefaultTemplateEvent" ADD CONSTRAINT "TenantDefaultTemplateEvent_actorUserId_User_id_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "TemplateVersion" ADD COLUMN "changes" jsonb;
--> statement-breakpoint
CREATE INDEX "TemplateInstallation_autoUpdate_sourceTemplateId_sourceVersion_idx" ON "TemplateInstallation" ("sourceTemplateId","sourceVersion") WHERE "autoUpdate" = true AND "status" IN ('completed', 'partial') AND "sourceDeletedAt" IS NULL;
