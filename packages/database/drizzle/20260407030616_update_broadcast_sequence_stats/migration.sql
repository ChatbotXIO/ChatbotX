DROP TABLE IF EXISTS "SequenceEvent" CASCADE;
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "sentAt" bigint;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "readAt" bigint;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD COLUMN IF NOT EXISTS "isRead" boolean GENERATED ALWAYS AS (case when "sentAt" is null then false when "readAt" is null then false else "readAt" >= "sentAt" end) STORED;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD COLUMN IF NOT EXISTS "contactInboxId" bigint NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_on_broadcast_contact_id" ON "ContactOnBroadcast" ("contactId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_on_broadcast_is_read" ON "ContactOnBroadcast" ("isRead");--> statement-breakpoint
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
