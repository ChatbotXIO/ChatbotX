CREATE TABLE "IntegrationOpenrouter" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"autoReply" boolean DEFAULT false NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"maxOutputTokens" integer NOT NULL,
	"model" text NOT NULL,
	"prompt" text,
	"temperature" double precision
);
--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationOpenrouter_workspaceId_key" ON "IntegrationOpenrouter" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationOpenrouter_integrationId_key" ON "IntegrationOpenrouter" ("integrationId");--> statement-breakpoint
ALTER TABLE "IntegrationOpenrouter" ADD CONSTRAINT "IntegrationOpenrouter_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOpenrouter" ADD CONSTRAINT "IntegrationOpenrouter_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;