CREATE TYPE "inboundWebhookRequestStatus" AS ENUM('received', 'processing', 'processed', 'completedWithErrors', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "InboundWebhook" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"token" text NOT NULL,
	"inboxResolution" jsonb,
	"identifiers" jsonb NOT NULL,
	"fieldMappings" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"sampleJson" jsonb,
	"requestCount" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "InboundWebhookRequest" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboundWebhookId" bigint NOT NULL,
	"idempotencyKey" text,
	"clientIp" text,
	"userAgent" text,
	"status" "inboundWebhookRequestStatus" DEFAULT 'received'::"inboundWebhookRequestStatus" NOT NULL,
	"claimToken" text,
	"claimedAt" timestamp(6) with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"skipReason" text,
	"errorCode" text,
	"errorMessage" text,
	"inboxId" bigint,
	"contactId" bigint,
	"contactInboxId" bigint,
	"payload" jsonb NOT NULL,
	"fieldErrors" jsonb,
	"actionResults" jsonb,
	"processedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE INDEX "InboundWebhook_workspaceId_idx" ON "InboundWebhook" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "InboundWebhook_token_key" ON "InboundWebhook" ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "InboundWebhookRequest_inboundWebhookId_idempotencyKey_key" ON "InboundWebhookRequest" ("inboundWebhookId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "InboundWebhookRequest_inboundWebhookId_createdAt_idx" ON "InboundWebhookRequest" ("inboundWebhookId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "InboundWebhookRequest_workspaceId_idx" ON "InboundWebhookRequest" ("workspaceId");--> statement-breakpoint
CREATE INDEX "InboundWebhookRequest_contactId_idx" ON "InboundWebhookRequest" ("contactId");--> statement-breakpoint
CREATE INDEX "InboundWebhookRequest_inboxId_idx" ON "InboundWebhookRequest" ("inboxId");--> statement-breakpoint
CREATE INDEX "InboundWebhookRequest_createdAt_received_idx" ON "InboundWebhookRequest" ("createdAt") WHERE "status" = 'received';--> statement-breakpoint
CREATE INDEX "InboundWebhookRequest_claimedAt_processing_idx" ON "InboundWebhookRequest" ("claimedAt") WHERE "status" = 'processing';--> statement-breakpoint
CREATE INDEX "InboundWebhookRequest_createdAt_idx" ON "InboundWebhookRequest" ("createdAt");--> statement-breakpoint
ALTER TABLE "InboundWebhook" ADD CONSTRAINT "InboundWebhook_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboundWebhookRequest" ADD CONSTRAINT "InboundWebhookRequest_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboundWebhookRequest" ADD CONSTRAINT "InboundWebhookRequest_inboundWebhookId_InboundWebhook_id_fkey" FOREIGN KEY ("inboundWebhookId") REFERENCES "InboundWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboundWebhookRequest" ADD CONSTRAINT "InboundWebhookRequest_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboundWebhookRequest" ADD CONSTRAINT "InboundWebhookRequest_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;