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
