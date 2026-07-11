CREATE TABLE "WebhookExecution" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"executedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"webhookId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "WebhookExecution_webhookId_contactId_key" ON "WebhookExecution" ("webhookId","contactId");--> statement-breakpoint
CREATE INDEX "WebhookExecution_workspaceId_idx" ON "WebhookExecution" ("workspaceId");--> statement-breakpoint
ALTER TABLE "WebhookExecution" ADD CONSTRAINT "WebhookExecution_webhookId_Webhook_id_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WebhookExecution" ADD CONSTRAINT "WebhookExecution_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WebhookExecution" ADD CONSTRAINT "WebhookExecution_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
