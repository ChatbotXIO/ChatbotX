CREATE TABLE "IntegrationFacebookAds" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"auth" jsonb NOT NULL,
	"tokenExpiresAt" timestamp(6) with time zone,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationFacebookAds_integrationId_key" ON "IntegrationFacebookAds" ("integrationId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationFacebookAds_workspaceId_key" ON "IntegrationFacebookAds" ("workspaceId");--> statement-breakpoint
ALTER TABLE "IntegrationFacebookAds" ADD CONSTRAINT "IntegrationFacebookAds_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationFacebookAds" ADD CONSTRAINT "IntegrationFacebookAds_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;