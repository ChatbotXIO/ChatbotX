CREATE TABLE "FacebookMarketingMessageAudience" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"customAudienceId" text NOT NULL,
	"adAccountId" text NOT NULL,
	"pageId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rowsUploaded" integer NOT NULL,
	"readyAt" timestamp(6) with time zone,
	"facebookUserId" text
);
--> statement-breakpoint
CREATE INDEX "FacebookMarketingMessageAudience_workspaceId_idx" ON "FacebookMarketingMessageAudience" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "FacebookMarketingMessageAudience_customAudienceId_key" ON "FacebookMarketingMessageAudience" ("customAudienceId");--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessageAudience" ADD CONSTRAINT "FacebookMarketingMessageAudience_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;