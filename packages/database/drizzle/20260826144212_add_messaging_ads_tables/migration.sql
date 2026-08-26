CREATE TYPE "messagingAdChannel" AS ENUM('whatsapp', 'messenger', 'instagram');
--> statement-breakpoint
CREATE TYPE "messagingAdCreateState" AS ENUM('pending', 'campaignCreated', 'adSetCreated', 'creativeCreated', 'adCreated', 'failed');
--> statement-breakpoint
CREATE TYPE "messagingAdPublishState" AS ENUM('draft', 'publishing', 'published', 'pausing', 'paused', 'deleting', 'deleted', 'publishFailed');
--> statement-breakpoint
CREATE TABLE "MessagingAdOperation" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"channel" "messagingAdChannel" NOT NULL,
	"integrationWhatsappId" bigint,
	"integrationMessengerId" bigint,
	"integrationInstagramId" bigint,
	"adAccountId" text NOT NULL,
	"name" text NOT NULL,
	"createState" "messagingAdCreateState" DEFAULT 'pending'::"messagingAdCreateState" NOT NULL,
	"publishState" "messagingAdPublishState" DEFAULT 'draft'::"messagingAdPublishState" NOT NULL,
	"metaCampaignId" text,
	"metaAdSetId" text,
	"metaAdCreativeId" text,
	"metaAdId" text,
	"input" jsonb NOT NULL,
	"lastError" text,
	"cleanupError" text,
	"createdBy" bigint,
	CONSTRAINT "MessagingAdOperation_channel_integration_check" CHECK (("channel" = 'whatsapp' AND "integrationWhatsappId" IS NOT NULL AND "integrationMessengerId" IS NULL AND "integrationInstagramId" IS NULL) OR ("channel" = 'messenger' AND "integrationMessengerId" IS NOT NULL AND "integrationWhatsappId" IS NULL AND "integrationInstagramId" IS NULL) OR ("channel" = 'instagram' AND "integrationInstagramId" IS NOT NULL AND "integrationWhatsappId" IS NULL AND "integrationMessengerId" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "MessagingAdsConnection" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"channel" "messagingAdChannel" NOT NULL,
	"integrationWhatsappId" bigint,
	"integrationMessengerId" bigint,
	"integrationInstagramId" bigint,
	"auth" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "MessagingAdsConnection_channel_integration_check" CHECK (("channel" = 'whatsapp' AND "integrationWhatsappId" IS NOT NULL AND "integrationMessengerId" IS NULL AND "integrationInstagramId" IS NULL) OR ("channel" = 'messenger' AND "integrationMessengerId" IS NOT NULL AND "integrationWhatsappId" IS NULL AND "integrationInstagramId" IS NULL) OR ("channel" = 'instagram' AND "integrationInstagramId" IS NOT NULL AND "integrationWhatsappId" IS NULL AND "integrationMessengerId" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "MessagingAdOperation_workspaceId_idx" ON "MessagingAdOperation" ("workspaceId");
--> statement-breakpoint
CREATE INDEX "MessagingAdOperation_integrationWhatsappId_idx" ON "MessagingAdOperation" ("integrationWhatsappId");
--> statement-breakpoint
CREATE INDEX "MessagingAdOperation_integrationMessengerId_idx" ON "MessagingAdOperation" ("integrationMessengerId");
--> statement-breakpoint
CREATE INDEX "MessagingAdOperation_integrationInstagramId_idx" ON "MessagingAdOperation" ("integrationInstagramId");
--> statement-breakpoint
CREATE INDEX "MessagingAdsConnection_workspaceId_idx" ON "MessagingAdsConnection" ("workspaceId");
--> statement-breakpoint
CREATE UNIQUE INDEX "MessagingAdsConnection_integrationWhatsappId_key" ON "MessagingAdsConnection" ("integrationWhatsappId");
--> statement-breakpoint
CREATE UNIQUE INDEX "MessagingAdsConnection_integrationMessengerId_key" ON "MessagingAdsConnection" ("integrationMessengerId");
--> statement-breakpoint
CREATE UNIQUE INDEX "MessagingAdsConnection_integrationInstagramId_key" ON "MessagingAdsConnection" ("integrationInstagramId");
--> statement-breakpoint
ALTER TABLE "MessagingAdOperation" ADD CONSTRAINT "MessagingAdOperation_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "MessagingAdOperation" ADD CONSTRAINT "MessagingAdOperation_D2X0VlACjh0B_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "MessagingAdOperation" ADD CONSTRAINT "MessagingAdOperation_DlCmuyYqclNt_fkey" FOREIGN KEY ("integrationMessengerId") REFERENCES "IntegrationMessenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "MessagingAdOperation" ADD CONSTRAINT "MessagingAdOperation_LwL2ykeZegup_fkey" FOREIGN KEY ("integrationInstagramId") REFERENCES "IntegrationInstagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "MessagingAdOperation" ADD CONSTRAINT "MessagingAdOperation_createdBy_User_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "MessagingAdsConnection" ADD CONSTRAINT "MessagingAdsConnection_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "MessagingAdsConnection" ADD CONSTRAINT "MessagingAdsConnection_Q2FrBLiP3QqD_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "MessagingAdsConnection" ADD CONSTRAINT "MessagingAdsConnection_tLZC78O5pMBb_fkey" FOREIGN KEY ("integrationMessengerId") REFERENCES "IntegrationMessenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "MessagingAdsConnection" ADD CONSTRAINT "MessagingAdsConnection_4ubezEjd9jQX_fkey" FOREIGN KEY ("integrationInstagramId") REFERENCES "IntegrationInstagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
