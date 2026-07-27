CREATE TABLE "FacebookLeadAdsAutomation" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"pageId" text NOT NULL,
	"pageName" text,
	"formId" text NOT NULL,
	"formName" text,
	"fieldMapping" jsonb DEFAULT '[]' NOT NULL,
	"flowId" bigint,
	"leadsHandledCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FacebookLeadAdsLead" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"automationId" bigint NOT NULL,
	"leadgenId" text NOT NULL,
	"contactId" bigint
);
--> statement-breakpoint
CREATE UNIQUE INDEX "FacebookLeadAdsAutomation_workspaceId_pageId_formId_key" ON "FacebookLeadAdsAutomation" ("workspaceId","pageId","formId");--> statement-breakpoint
CREATE UNIQUE INDEX "FacebookLeadAdsLead_automationId_leadgenId_key" ON "FacebookLeadAdsLead" ("automationId","leadgenId");--> statement-breakpoint
CREATE INDEX "FacebookLeadAdsLead_leadgenId_idx" ON "FacebookLeadAdsLead" ("leadgenId");--> statement-breakpoint
ALTER TABLE "FacebookLeadAdsAutomation" ADD CONSTRAINT "FacebookLeadAdsAutomation_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FacebookLeadAdsAutomation" ADD CONSTRAINT "FacebookLeadAdsAutomation_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FacebookLeadAdsLead" ADD CONSTRAINT "FacebookLeadAdsLead_n8swD949nr3L_fkey" FOREIGN KEY ("automationId") REFERENCES "FacebookLeadAdsAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FacebookLeadAdsLead" ADD CONSTRAINT "FacebookLeadAdsLead_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
