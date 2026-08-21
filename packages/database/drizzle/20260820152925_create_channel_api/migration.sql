CREATE TABLE "IntegrationApi" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"name" text NOT NULL,
	"tokenHash" text NOT NULL,
	"tokenPrefix" text NOT NULL,
	"callbackUrl" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IntegrationApi_workspaceId_idx" ON "IntegrationApi" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationApi_inboxId_key" ON "IntegrationApi" ("inboxId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationApi_tokenHash_key" ON "IntegrationApi" ("tokenHash");--> statement-breakpoint
ALTER TABLE "IntegrationApi" ADD CONSTRAINT "IntegrationApi_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationApi" ADD CONSTRAINT "IntegrationApi_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;