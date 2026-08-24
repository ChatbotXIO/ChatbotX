CREATE TYPE "templateInstallationStatus" AS ENUM('pending', 'installing', 'completed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "templateResourceCategory" AS ENUM('flows', 'customFields', 'tags', 'products', 'productCategories', 'aiFunctions', 'aiAgents', 'calendars', 'webchats', 'keywords', 'entryPointLinks', 'triggers', 'fbCommentAutomations', 'settings');--> statement-breakpoint
CREATE TABLE "Template" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"tenantId" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"imageUrl" text,
	"publisherName" text,
	"youtubeVideoId" text,
	"testLink" text,
	"selection" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"categoryCounts" jsonb NOT NULL,
	"formatVersion" integer NOT NULL,
	"shareToken" text NOT NULL,
	"shareEnabled" boolean DEFAULT false NOT NULL,
	"shareExpiresAt" timestamp(6) with time zone,
	"defaultPermissions" jsonb NOT NULL,
	"installCount" integer DEFAULT 0 NOT NULL,
	"createdBy" bigint,
	"deletedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "TemplateInstallation" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"templateId" bigint,
	"templateName" text NOT NULL,
	"sourceWorkspaceId" bigint NOT NULL,
	"formatVersion" integer NOT NULL,
	"status" "templateInstallationStatus" DEFAULT 'pending'::"templateInstallationStatus" NOT NULL,
	"permissions" jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]' NOT NULL,
	"warningCount" integer DEFAULT 0 NOT NULL,
	"errorMessage" text,
	"resourceCount" integer DEFAULT 0 NOT NULL,
	"installedBy" bigint,
	"completedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "TemplateInstalledResource" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"installationId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"category" "templateResourceCategory" NOT NULL,
	"resourceKind" text NOT NULL,
	"resourceId" bigint NOT NULL,
	"sourceResourceId" text NOT NULL,
	"wasExisting" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "Template_workspaceId_idx" ON "Template" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Template_tenantId_idx" ON "Template" ("tenantId");--> statement-breakpoint
CREATE UNIQUE INDEX "Template_shareToken_key" ON "Template" ("shareToken");--> statement-breakpoint
CREATE INDEX "TemplateInstallation_workspaceId_idx" ON "TemplateInstallation" ("workspaceId");--> statement-breakpoint
CREATE INDEX "TemplateInstallation_templateId_idx" ON "TemplateInstallation" ("templateId");--> statement-breakpoint
CREATE INDEX "TemplateInstallation_workspaceId_status_idx" ON "TemplateInstallation" ("workspaceId","status");--> statement-breakpoint
CREATE INDEX "TemplateInstalledResource_installationId_idx" ON "TemplateInstalledResource" ("installationId");--> statement-breakpoint
CREATE INDEX "TemplateInstalledResource_workspaceId_resourceKind_resourceId_idx" ON "TemplateInstalledResource" ("workspaceId","resourceKind","resourceId");--> statement-breakpoint
ALTER TABLE "Template" ADD CONSTRAINT "Template_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Template" ADD CONSTRAINT "Template_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Template" ADD CONSTRAINT "Template_createdBy_User_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD CONSTRAINT "TemplateInstallation_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD CONSTRAINT "TemplateInstallation_templateId_Template_id_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD CONSTRAINT "TemplateInstallation_installedBy_User_id_fkey" FOREIGN KEY ("installedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD CONSTRAINT "TemplateInstalledResource_a0BqwWeO96EB_fkey" FOREIGN KEY ("installationId") REFERENCES "TemplateInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateInstalledResource" ADD CONSTRAINT "TemplateInstalledResource_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;