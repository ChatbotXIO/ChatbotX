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
