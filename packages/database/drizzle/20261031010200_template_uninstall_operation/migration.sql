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
