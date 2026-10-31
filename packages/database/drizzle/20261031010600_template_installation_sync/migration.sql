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
