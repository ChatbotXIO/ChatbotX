CREATE TABLE "IntegrationLine" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"channelId" text NOT NULL,
	"botUserId" text NOT NULL,
	"basicId" text NOT NULL,
	"name" text NOT NULL,
	"pictureUrl" text,
	"tokenRefreshError" text,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IntegrationLine_workspaceId_idx" ON "IntegrationLine" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationLine_inboxId_key" ON "IntegrationLine" ("inboxId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationLine_channelId_key" ON "IntegrationLine" ("channelId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationLine_botUserId_key" ON "IntegrationLine" ("botUserId");--> statement-breakpoint
ALTER TABLE "IntegrationLine" ADD CONSTRAINT "IntegrationLine_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationLine" ADD CONSTRAINT "IntegrationLine_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;