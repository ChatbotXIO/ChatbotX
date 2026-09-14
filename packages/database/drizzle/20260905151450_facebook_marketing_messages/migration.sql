CREATE TABLE "FacebookMarketingMessage" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"pageId" text NOT NULL,
	"adAccountId" text NOT NULL,
	"currency" text NOT NULL,
	"currencyOffset" integer NOT NULL,
	"budgetType" text NOT NULL,
	"budgetMinorUnits" integer NOT NULL,
	"content" jsonb NOT NULL,
	"campaignId" text NOT NULL,
	"facebookUserId" text
);
--> statement-breakpoint
CREATE TABLE "FacebookMarketingMessagesAuth" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"auth" jsonb NOT NULL,
	"tokenExpiresAt" timestamp(6) with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"facebookUserId" text
);
--> statement-breakpoint
CREATE INDEX "FacebookMarketingMessage_workspaceId_idx" ON "FacebookMarketingMessage" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "FacebookMarketingMessage_campaignId_key" ON "FacebookMarketingMessage" ("campaignId");--> statement-breakpoint
CREATE UNIQUE INDEX "FacebookMarketingMessagesAuth_workspaceId_key" ON "FacebookMarketingMessagesAuth" ("workspaceId");--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD CONSTRAINT "FacebookMarketingMessage_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessagesAuth" ADD CONSTRAINT "FacebookMarketingMessagesAuth_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;