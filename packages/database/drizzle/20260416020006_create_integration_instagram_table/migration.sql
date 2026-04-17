CREATE TABLE "IntegrationInstagram" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"igId" text NOT NULL,
	"pageId" text NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"conversationStarters" jsonb[] NOT NULL,
	"persistentMenus" jsonb[] NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"welcomeFlowId" bigint
);
--> statement-breakpoint
CREATE INDEX "IntegrationInstagram_workspaceId_idx" ON "IntegrationInstagram" ("workspaceId");--> statement-breakpoint
CREATE INDEX "IntegrationInstagram_welcomeFlowId_idx" ON "IntegrationInstagram" ("welcomeFlowId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationInstagram_inboxId_key" ON "IntegrationInstagram" ("inboxId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationInstagram_igId_key" ON "IntegrationInstagram" ("igId");--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD CONSTRAINT "IntegrationInstagram_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD CONSTRAINT "IntegrationInstagram_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD CONSTRAINT "IntegrationInstagram_welcomeFlowId_fkey" FOREIGN KEY ("welcomeFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
