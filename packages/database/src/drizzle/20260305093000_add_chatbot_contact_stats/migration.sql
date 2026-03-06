DROP TRIGGER IF EXISTS contact_delete_stats_trigger ON "Contact";
DROP TRIGGER IF EXISTS contact_insert_stats_trigger ON "Contact";
DROP FUNCTION IF EXISTS decrement_contact_stats();
DROP FUNCTION IF EXISTS increment_contact_stats();
DROP TABLE IF EXISTS "ChatbotContactStats";
DROP TABLE IF EXISTS "InboxContactStats";

CREATE TABLE "InboxContactStats" (
	"inboxId" text PRIMARY KEY NOT NULL,
	"totalContacts" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "InboxContactStats" ADD CONSTRAINT "InboxContactStats_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION increment_contact_stats()
RETURNS TRIGGER AS $$
DECLARE
    v_inbox_id TEXT;
BEGIN
    SELECT "inboxId" INTO v_inbox_id
    FROM "Conversation"
    WHERE "contactId" = NEW."id"
    LIMIT 1;

    IF v_inbox_id IS NOT NULL THEN
        INSERT INTO "InboxContactStats" ("inboxId", "totalContacts", "updatedAt")
        VALUES (v_inbox_id, 1, CURRENT_TIMESTAMP)
        ON CONFLICT ("inboxId") DO UPDATE SET
            "totalContacts" = "InboxContactStats"."totalContacts" + 1,
            "updatedAt" = CURRENT_TIMESTAMP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER contact_insert_stats_trigger
    AFTER INSERT ON "Contact"
    FOR EACH ROW
    EXECUTE FUNCTION increment_contact_stats();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION decrement_contact_stats()
RETURNS TRIGGER AS $$
DECLARE
    v_inbox_id TEXT;
BEGIN
    SELECT "inboxId" INTO v_inbox_id
    FROM "Conversation"
    WHERE "contactId" = OLD."id"
    LIMIT 1;

    IF v_inbox_id IS NOT NULL THEN
        UPDATE "InboxContactStats"
        SET "totalContacts" = GREATEST("totalContacts" - 1, 0),
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "inboxId" = v_inbox_id;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER contact_delete_stats_trigger
    BEFORE DELETE ON "Contact"
    FOR EACH ROW
    EXECUTE FUNCTION decrement_contact_stats();
--> statement-breakpoint
INSERT INTO "InboxContactStats" ("inboxId", "totalContacts", "updatedAt")
SELECT c."inboxId", COUNT(DISTINCT co."id")::integer, CURRENT_TIMESTAMP
FROM "Conversation" c
INNER JOIN "Contact" co ON co."id" = c."contactId"
GROUP BY c."inboxId"
ON CONFLICT ("inboxId") DO UPDATE SET
    "totalContacts" = EXCLUDED."totalContacts",
    "updatedAt" = CURRENT_TIMESTAMP;
