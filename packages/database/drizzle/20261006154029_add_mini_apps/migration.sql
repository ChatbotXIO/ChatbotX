CREATE TYPE "miniAppSubmissionSource" AS ENUM('web');--> statement-breakpoint
CREATE TABLE "MiniApp" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"definition" jsonb NOT NULL,
	"flowJson" jsonb NOT NULL,
	"submissionsCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MiniAppPublication" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"miniAppId" bigint NOT NULL,
	"integrationWhatsappId" bigint NOT NULL,
	"whatsappFlowId" bigint,
	"sourceId" text NOT NULL,
	"status" text NOT NULL,
	"validationErrors" jsonb NOT NULL,
	"publishedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "MiniAppSubmission" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"miniAppId" bigint NOT NULL,
	"contactId" bigint,
	"source" "miniAppSubmissionSource" NOT NULL,
	"answers" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "MiniApp_workspaceId_idx" ON "MiniApp" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "MiniApp_workspaceId_name_key" ON "MiniApp" ("workspaceId","name");--> statement-breakpoint
CREATE UNIQUE INDEX "MiniAppPublication_miniAppId_integrationWhatsappId_key" ON "MiniAppPublication" ("miniAppId","integrationWhatsappId");--> statement-breakpoint
CREATE INDEX "MiniAppSubmission_miniAppId_createdAt_idx" ON "MiniAppSubmission" ("miniAppId","createdAt" DESC);--> statement-breakpoint
CREATE INDEX "MiniAppSubmission_contactId_idx" ON "MiniAppSubmission" ("contactId");--> statement-breakpoint
ALTER TABLE "MiniApp" ADD CONSTRAINT "MiniApp_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MiniAppPublication" ADD CONSTRAINT "MiniAppPublication_miniAppId_MiniApp_id_fkey" FOREIGN KEY ("miniAppId") REFERENCES "MiniApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MiniAppPublication" ADD CONSTRAINT "MiniAppPublication_oBb1VPqI8uvn_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MiniAppPublication" ADD CONSTRAINT "MiniAppPublication_whatsappFlowId_WhatsappFlow_id_fkey" FOREIGN KEY ("whatsappFlowId") REFERENCES "WhatsappFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MiniAppSubmission" ADD CONSTRAINT "MiniAppSubmission_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MiniAppSubmission" ADD CONSTRAINT "MiniAppSubmission_miniAppId_MiniApp_id_fkey" FOREIGN KEY ("miniAppId") REFERENCES "MiniApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MiniAppSubmission" ADD CONSTRAINT "MiniAppSubmission_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;