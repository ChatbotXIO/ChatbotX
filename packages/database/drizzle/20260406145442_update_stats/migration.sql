DROP TABLE IF EXISTS "SequenceEvent" CASCADE;

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
