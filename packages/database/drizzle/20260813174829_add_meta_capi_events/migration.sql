DROP TABLE IF EXISTS "MetaCapiEvent";--> statement-breakpoint
CREATE TABLE "MetaCapiEvent" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"channel" text NOT NULL,
	"integrationId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"eventName" text NOT NULL,
	"currency" text,
	"contentCategory" text,
	"contentName" text,
	"value" numeric,
	"source" text NOT NULL,
	"sourceKey" text NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"capiStatus" text DEFAULT 'pending' NOT NULL,
	"capiSentAt" timestamp(6) with time zone,
	"capiError" text,
	CONSTRAINT "MetaCapiEvent_channel_check" CHECK ("channel" IN ('messenger', 'instagram')),
	CONSTRAINT "MetaCapiEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT "MetaCapiEvent_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD COLUMN IF NOT EXISTS "hasCapiScope" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD COLUMN IF NOT EXISTS "capiScopeCheckedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD COLUMN IF NOT EXISTS "datasetId" text;--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD COLUMN IF NOT EXISTS "capiAccessToken" jsonb;--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD COLUMN IF NOT EXISTS "capiDisconnectedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN IF NOT EXISTS "hasCapiScope" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN IF NOT EXISTS "capiScopeCheckedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN IF NOT EXISTS "datasetId" text;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN IF NOT EXISTS "capiAccessToken" jsonb;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN IF NOT EXISTS "capiDisconnectedAt" timestamp(6) with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "MetaCapiEvent_workspaceId_channel_sourceKey_key" ON "MetaCapiEvent" ("workspaceId","channel","sourceKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MetaCapiEvent_contactInboxId_idx" ON "MetaCapiEvent" ("contactInboxId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MetaCapiEvent_channel_integrationId_idx" ON "MetaCapiEvent" ("channel","integrationId");
