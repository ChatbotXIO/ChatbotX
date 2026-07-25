CREATE TABLE "ExternalWebhook" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"provider" text DEFAULT 'make' NOT NULL,
	"event" text NOT NULL,
	"url" text NOT NULL,
	"workspaceId" bigint NOT NULL
);
CREATE INDEX "ExternalWebhook_workspaceId_event_idx" ON "ExternalWebhook" ("workspaceId","event");--> statement-breakpoint
CREATE UNIQUE INDEX "ExternalWebhook_workspaceId_event_url_key" ON "ExternalWebhook" ("workspaceId","event","url");--> statement-breakpoint
ALTER TABLE "ExternalWebhook" ADD CONSTRAINT "ExternalWebhook_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
