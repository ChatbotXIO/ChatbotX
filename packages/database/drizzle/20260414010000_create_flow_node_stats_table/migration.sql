DROP TABLE IF EXISTS "FlowAnalyticsSession";--> statement-breakpoint
DROP TABLE IF EXISTS "FlowNodeStat";--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "FlowAnalyticsSession" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"flowId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"deletedAt" timestamp(6) with time zone
);
INSERT INTO "FlowAnalyticsSession" ("id", "createdAt", "updatedAt", "flowId", "workspaceId")
SELECT id, "createdAt", "updatedAt", id, "workspaceId"
FROM "Flow" ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "FlowNodeStat" (
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
	"occurredAt" timestamp(6) with time zone,
	"seenAt" timestamp(6) with time zone,
	"errorContent" text,
	"refId" text,
	"refType" integer
);
--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" DROP CONSTRAINT IF EXISTS "AnalyticsManifestStatus_pkey";--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" ADD COLUMN IF NOT EXISTS "objectKey" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "contactInboxId" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "conversationId" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "seenAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "deliveredAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "clickedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "failedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "errorContent" text;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "isRead" boolean GENERATED ALWAYS AS (case when "seenAt" is null then false when "deliveredAt" is null then false else "seenAt" >= "deliveredAt" end) STORED;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN IF NOT EXISTS "isRead" boolean GENERATED ALWAYS AS (case when "seenAt" is null then false when "deliveredAt" is null then false else "seenAt" >= "deliveredAt" end) STORED;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN IF NOT EXISTS "deliveredAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN IF NOT EXISTS "seenAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN IF NOT EXISTS "clickedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN IF NOT EXISTS "failedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN IF NOT EXISTS "errorContent" text;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN IF NOT EXISTS "contactInboxId" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" DROP COLUMN IF EXISTS "id";--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" DROP COLUMN IF EXISTS "createdAt";--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" DROP COLUMN IF EXISTS "updatedAt";--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ALTER COLUMN "runAtMs" SET DATA TYPE bigint USING "runAtMs"::bigint;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsManifestStatus_objectKey_key" ON "AnalyticsManifestStatus" ("objectKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_on_broadcast_contact_id" ON "ContactOnBroadcast" ("contactId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_on_broadcast_is_read" ON "ContactOnBroadcast" ("isRead");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sequence_dispatch_is_read" ON "SequenceDispatch" ("isRead");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "FlowAnalyticsSession_workspaceId_flowId_key" ON "FlowAnalyticsSession" ("flowId","workspaceId") WHERE "deletedAt" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FlowAnalyticsSession_flowId_idx" ON "FlowAnalyticsSession" ("flowId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FlowNodeStat_filter_1_idx" ON "FlowNodeStat" ("workspaceId","analyticsId","nodeId","eventType","buttonId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FlowNodeStat_filter_2_idx" ON "FlowNodeStat" ("workspaceId","analyticsId","nodeId") WHERE "eventType" = 'seen' AND "seenAt" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" DROP CONSTRAINT IF EXISTS "ContactOnBroadcast_contactInboxId_ContactInbox_id_fkey";--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD CONSTRAINT "ContactOnBroadcast_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" DROP CONSTRAINT IF EXISTS "ContactOnBroadcast_conversationId_Conversation_id_fkey";--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD CONSTRAINT "ContactOnBroadcast_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowNodeStat" DROP CONSTRAINT IF EXISTS "FlowNodeStat_workspaceId_Workspace_id_fkey";--> statement-breakpoint
ALTER TABLE "FlowNodeStat" ADD CONSTRAINT "FlowNodeStat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" DROP CONSTRAINT IF EXISTS "SequenceDispatch_contactInboxId_ContactInbox_id_fkey";--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD CONSTRAINT "SequenceDispatch_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION increment_contact_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "InboxContactStat" ("inboxId", "totalContacts", "updatedAt")
    VALUES (NEW."inboxId", 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("inboxId") DO UPDATE SET
        "totalContacts" = "InboxContactStat"."totalContacts" + 1,
        "updatedAt" = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER contact_inbox_insert_stats_trigger
    AFTER INSERT ON "ContactInbox"
    FOR EACH ROW
    EXECUTE FUNCTION increment_contact_stats();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION decrement_contact_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE "InboxContactStat"
    SET "totalContacts" = GREATEST("totalContacts" - 1, 0),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "inboxId" = OLD."inboxId";

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER contact_inbox_delete_stats_trigger
    AFTER DELETE ON "ContactInbox"
    FOR EACH ROW
    EXECUTE FUNCTION decrement_contact_stats();
--> statement-breakpoint
INSERT INTO "InboxContactStat" ("inboxId", "totalContacts", "updatedAt")
SELECT "inboxId", COUNT(DISTINCT "originalContactId")::integer, CURRENT_TIMESTAMP
FROM "ContactInbox"
GROUP BY "inboxId"
ON CONFLICT ("inboxId") DO UPDATE SET
    "totalContacts" = EXCLUDED."totalContacts",
    "updatedAt" = CURRENT_TIMESTAMP;
