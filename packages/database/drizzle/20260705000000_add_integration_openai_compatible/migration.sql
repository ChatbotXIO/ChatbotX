CREATE TABLE "IntegrationOpenaiCompatible" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb,
	"autoReply" boolean DEFAULT false NOT NULL,
	"baseURL" text NOT NULL,
	"defaultModel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"integrationId" bigint NOT NULL,
	"name" text NOT NULL,
	"preset" text NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IntegrationOpenaiCompatible_workspaceId_idx" ON "IntegrationOpenaiCompatible" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationOpenaiCompatible_integrationId_key" ON "IntegrationOpenaiCompatible" ("integrationId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationOpenaiCompatible_workspaceId_preset_key" ON "IntegrationOpenaiCompatible" ("workspaceId", "preset") WHERE "preset" <> 'custom';--> statement-breakpoint
ALTER TABLE "IntegrationOpenaiCompatible" ADD CONSTRAINT "IntegrationOpenaiCompatible_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOpenaiCompatible" ADD CONSTRAINT "IntegrationOpenaiCompatible_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
