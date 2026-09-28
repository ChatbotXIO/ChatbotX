ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "sourceParentUserId" text;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = to_regclass('"ContactInbox_inboxId_sourceParentUserId_key"')
      AND NOT indisvalid
  ) THEN
    DROP INDEX IF EXISTS "ContactInbox_inboxId_sourceParentUserId_key";
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_inboxId_sourceParentUserId_key"
  ON "ContactInbox" USING btree ("inboxId", "sourceParentUserId")
  WHERE "sourceParentUserId" IS NOT NULL;
