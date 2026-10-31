CREATE TABLE "IntegrationMuse" (
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
CREATE UNIQUE INDEX "IntegrationMuse_workspaceId_key" ON "IntegrationMuse" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationMuse_integrationId_key" ON "IntegrationMuse" ("integrationId");--> statement-breakpoint
ALTER TABLE "IntegrationMuse" ADD CONSTRAINT "IntegrationMuse_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationMuse" ADD CONSTRAINT "IntegrationMuse_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;