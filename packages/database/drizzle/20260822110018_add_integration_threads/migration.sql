CREATE TABLE "IntegrationThreads" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"threadsUserId" text NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IntegrationThreads_workspaceId_idx" ON "IntegrationThreads" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationThreads_inboxId_key" ON "IntegrationThreads" ("inboxId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationThreads_threadsUserId_key" ON "IntegrationThreads" ("threadsUserId");--> statement-breakpoint
ALTER TABLE "IntegrationThreads" ADD CONSTRAINT "IntegrationThreads_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationThreads" ADD CONSTRAINT "IntegrationThreads_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;