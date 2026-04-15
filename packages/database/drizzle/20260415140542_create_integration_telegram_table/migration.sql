CREATE TABLE "IntegrationTelegram" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"botId" text NOT NULL,
	"name" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IntegrationTelegram_workspaceId_idx" ON "IntegrationTelegram" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationTelegram_inboxId_key" ON "IntegrationTelegram" ("inboxId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationTelegram_botId_key" ON "IntegrationTelegram" ("botId");--> statement-breakpoint
ALTER TABLE "IntegrationTelegram" ADD CONSTRAINT "IntegrationTelegram_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationTelegram" ADD CONSTRAINT "IntegrationTelegram_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
