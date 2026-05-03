ALTER TYPE "contentType" ADD VALUE 'refLink';--> statement-breakpoint
CREATE TABLE "FlowAnalyticsSession" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"flowId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"deletedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "FlowNodeStat" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"flowId" bigint NOT NULL,
	"analyticsId" bigint NOT NULL,
	"nodeId" text NOT NULL,
	"buttonId" text,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"eventType" text NOT NULL,
	"errorContent" text,
	"occurredAt" timestamp(6) with time zone,
	"seenAt" timestamp(6) with time zone,
	"refId" text,
	"refType" integer
);
--> statement-breakpoint
CREATE TABLE "MagicLinkStat" (
	"workspaceId" bigint NOT NULL,
	"linkId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RefLinkStat" (
	"workspaceId" bigint NOT NULL,
	"linkId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" DROP CONSTRAINT "AnalyticsManifestStatus_pkey";--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" ADD COLUMN "objectKey" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN "contactInboxId" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN "conversationId" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN "seenAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN "deliveredAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN "clickedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN "failedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN "errorContent" text;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN "isRead" boolean GENERATED ALWAYS AS (case when "seenAt" is null then false when "deliveredAt" is null then false else "seenAt" >= "deliveredAt" end) STORED;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN "deliveredAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN "seenAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN "clickedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN "failedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN "errorContent" text;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN "contactInboxId" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN "isRead" boolean GENERATED ALWAYS AS (case when "seenAt" is null then false when "deliveredAt" is null then false else "seenAt" >= "deliveredAt" end) STORED;--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" DROP COLUMN "createdAt";--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" DROP COLUMN "updatedAt";--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ALTER COLUMN "runAtMs" SET DATA TYPE bigint USING "runAtMs"::bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "AnalyticsManifestStatus_objectKey_key" ON "AnalyticsManifestStatus" ("objectKey");--> statement-breakpoint
CREATE INDEX "idx_contact_on_broadcast_contact_id" ON "ContactOnBroadcast" ("contactId");--> statement-breakpoint
CREATE INDEX "idx_contact_on_broadcast_is_read" ON "ContactOnBroadcast" ("isRead");--> statement-breakpoint
CREATE UNIQUE INDEX "FlowAnalyticsSession_workspaceId_flowId_key" ON "FlowAnalyticsSession" ("flowId","workspaceId") WHERE "deletedAt" IS NULL;--> statement-breakpoint
CREATE INDEX "FlowAnalyticsSession_flowId_idx" ON "FlowAnalyticsSession" ("flowId");--> statement-breakpoint
CREATE INDEX "FlowNodeStat_filter_1_idx" ON "FlowNodeStat" ("workspaceId","analyticsId","nodeId","eventType","buttonId");--> statement-breakpoint
CREATE INDEX "FlowNodeStat_filter_2_idx" ON "FlowNodeStat" ("workspaceId","analyticsId","nodeId") WHERE "eventType" = 'seen' AND "seenAt" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "MagicLinkStat_workspaceId_linkId_occurredAt_idx" ON "MagicLinkStat" ("workspaceId","linkId","occurredAt");--> statement-breakpoint
CREATE INDEX "RefLinkStat_workspaceId_linkId_occurredAt_idx" ON "RefLinkStat" ("workspaceId","linkId","occurredAt");--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD CONSTRAINT "ContactOnBroadcast_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD CONSTRAINT "ContactOnBroadcast_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowNodeStat" ADD CONSTRAINT "FlowNodeStat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MagicLinkStat" ADD CONSTRAINT "MagicLinkStat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MagicLinkStat" ADD CONSTRAINT "MagicLinkStat_linkId_MagicLink_id_fkey" FOREIGN KEY ("linkId") REFERENCES "MagicLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "RefLinkStat" ADD CONSTRAINT "RefLinkStat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "RefLinkStat" ADD CONSTRAINT "RefLinkStat_linkId_Reflink_id_fkey" FOREIGN KEY ("linkId") REFERENCES "Reflink"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD CONSTRAINT "SequenceDispatch_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
