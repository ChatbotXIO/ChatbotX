-- Bulk AI hand-over "take back from AI for all customers" walks only the threads the
-- AI agent holds (`standby` + `ai_agent`) of one inbox in id order. Without
-- this partial index each keyset page would scan the whole inbox to find them.
-- It only holds those rows, so it stays tiny.
--
-- `ContactInbox` takes a webhook write for every incoming message: a plain
-- `CREATE INDEX` would hold a SHARE lock (blocking writes) for the whole build.
-- CONCURRENTLY avoids that and makes this migration run unwrapped (no
-- transaction), so it is idempotent: a failed build leaves an INVALID index
-- that is dropped first, then rebuilt.
DROP INDEX CONCURRENTLY IF EXISTS "ContactInbox_inboxId_id_ai_held_idx";
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_inboxId_id_ai_held_idx" ON "ContactInbox" ("inboxId","id") WHERE "threadControlState" = 'standby' AND "threadOwnerRole" = 'ai_agent';
