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
