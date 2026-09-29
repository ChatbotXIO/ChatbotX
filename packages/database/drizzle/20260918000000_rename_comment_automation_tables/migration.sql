-- Rename the comment-automation tables: the `FB` prefix is factually wrong.
-- The table serves five channels (messenger, instagram, instagramFacebook,
-- threads, tiktok) — three of which are not Facebook. Every object added after
-- the original table already dropped the prefix (commentAutomationReplyChannel,
-- commentAutomationMissReason, …); this finishes the job.

ALTER TABLE "FBCommentAutomation" RENAME TO "CommentAutomation";
--> statement-breakpoint
ALTER TABLE "FBCommentAutomationEvent" RENAME TO "CommentAutomationEvent";
--> statement-breakpoint
ALTER TABLE "FBCommentAutomationMiss" RENAME TO "CommentAutomationMiss";
--> statement-breakpoint
ALTER TABLE "FBCommentAutomationReply" RENAME TO "CommentAutomationReply";
--> statement-breakpoint

-- Primary and foreign keys are re-pointed by LOOKUP, not by their old name.
--
-- Postgres keeps constraint names across a table rename, and the names in this
-- database are not uniform: the two older tables carry Postgres' own defaults
-- (FBCommentAutomationReply_contactId_fkey) while the two newer ones carry
-- drizzle's longer form (FBCommentAutomationEvent_contactId_Contact_id_fkey),
-- and two are hashed because the generated name passed the 63-byte limit.
-- Naming the old constraint explicitly therefore fails on whichever half of a
-- given database does not match. Matching on (table, type, columns, target
-- table) is stable across all of them; the new name comes from the schema
-- snapshot, which is what drizzle will diff against from here on.
DO $$
DECLARE
  t record;
  found_name text;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('CommentAutomation', 'f', ARRAY['workspaceId'], 'Workspace', 'CommentAutomation_workspaceId_Workspace_id_fkey'),
    ('CommentAutomation', 'f', ARRAY['folderId'], 'Folder', 'CommentAutomation_folderId_Folder_id_fkey'),
    ('CommentAutomationEvent', 'f', ARRAY['workspaceId'], 'Workspace', 'CommentAutomationEvent_workspaceId_Workspace_id_fkey'),
    ('CommentAutomationEvent', 'f', ARRAY['automationId'], 'CommentAutomation', 'CommentAutomationEvent_automationId_CommentAutomation_id_fkey'),
    ('CommentAutomationEvent', 'f', ARRAY['contactId'], 'Contact', 'CommentAutomationEvent_contactId_Contact_id_fkey'),
    ('CommentAutomationEvent', 'f', ARRAY['contactInboxId'], 'ContactInbox', 'CommentAutomationEvent_contactInboxId_ContactInbox_id_fkey'),
    ('CommentAutomationMiss', 'f', ARRAY['workspaceId'], 'Workspace', 'CommentAutomationMiss_workspaceId_Workspace_id_fkey'),
    ('CommentAutomationMiss', 'f', ARRAY['automationId'], 'CommentAutomation', 'CommentAutomationMiss_automationId_CommentAutomation_id_fkey'),
    ('CommentAutomationMiss', 'f', ARRAY['contactId'], 'Contact', 'CommentAutomationMiss_contactId_Contact_id_fkey'),
    ('CommentAutomationMiss', 'f', ARRAY['contactInboxId'], 'ContactInbox', 'CommentAutomationMiss_contactInboxId_ContactInbox_id_fkey'),
    ('CommentAutomationReply', 'f', ARRAY['automationId'], 'CommentAutomation', 'CommentAutomationReply_automationId_CommentAutomation_id_fkey'),
    ('CommentAutomationReply', 'f', ARRAY['contactId'], 'Contact', 'CommentAutomationReply_contactId_Contact_id_fkey'),
    ('CommentAutomationReply', 'f', ARRAY['workspaceId'], 'Workspace', 'CommentAutomationReply_workspaceId_Workspace_id_fkey'),
    ('CommentAutomation', 'p', ARRAY['id'], NULL, 'CommentAutomation_pkey'),
    ('CommentAutomationEvent', 'p', ARRAY['id'], NULL, 'CommentAutomationEvent_pkey'),
    ('CommentAutomationMiss', 'p', ARRAY['id'], NULL, 'CommentAutomationMiss_pkey'),
    ('CommentAutomationReply', 'p', ARRAY['id'], NULL, 'CommentAutomationReply_pkey')
  ) AS v(tbl, kind, cols, tbl_to, desired)
  LOOP
    SELECT c.conname INTO found_name
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    LEFT JOIN pg_class relto ON relto.oid = c.confrelid
    WHERE rel.relname = t.tbl
      AND c.contype = t.kind::"char"
      AND (t.tbl_to IS NULL OR relto.relname = t.tbl_to)
      AND (
        SELECT array_agg(a.attname::text ORDER BY k.ord)
        FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = t.cols;

    IF found_name IS NULL THEN
      RAISE EXCEPTION 'constraint not found: %.% on (%)', t.tbl, t.kind, array_to_string(t.cols, ',');
    END IF;

    IF found_name <> t.desired THEN
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', t.tbl, found_name, t.desired);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER INDEX "FBCommentAutomation_workspaceId_idx" RENAME TO "CommentAutomation_workspaceId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomation_folderId_idx" RENAME TO "CommentAutomation_folderId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_dedup_idx" RENAME TO "CommentAutomationEvent_dedup_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_automation_occurredAt_idx" RENAME TO "CommentAutomationEvent_automation_occurredAt_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_contactId_idx" RENAME TO "CommentAutomationEvent_contactId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_contactInboxId_idx" RENAME TO "CommentAutomationEvent_contactInboxId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_private_unseen_idx" RENAME TO "CommentAutomationEvent_private_unseen_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationEvent_failed_createdAt_idx" RENAME TO "CommentAutomationEvent_failed_createdAt_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationMiss_dedup_idx" RENAME TO "CommentAutomationMiss_dedup_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationMiss_automation_occurredAt_idx" RENAME TO "CommentAutomationMiss_automation_occurredAt_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationMiss_contactId_idx" RENAME TO "CommentAutomationMiss_contactId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationMiss_contactInboxId_idx" RENAME TO "CommentAutomationMiss_contactInboxId_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationReply_dedup_idx" RENAME TO "CommentAutomationReply_dedup_idx";
--> statement-breakpoint
ALTER INDEX "FBCommentAutomationReply_contactId_idx" RENAME TO "CommentAutomationReply_contactId_idx";
--> statement-breakpoint
-- Everything else still carrying the prefix: Postgres names NOT NULL
-- constraints (and would name any CHECK) after the table, and those names
-- survive the rename too. Drizzle does not track them, so they cause no drift
-- — but a NOT NULL violation reporting FBCommentAutomation_type_not_null on a
-- table called CommentAutomation is needless confusion. Swept generically so
-- any constraint kind added later is covered without touching this migration.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT rel.relname AS tbl, c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE rel.relname LIKE 'CommentAutomation%'
      AND c.conname LIKE 'FBCommentAutomation%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
      con.tbl, con.conname, 'CommentAutomation' || substring(con.conname from 20)
    );
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TYPE "fbCommentAutomationType" RENAME TO "commentAutomationType";
--> statement-breakpoint

-- Nothing may keep the old prefix: a rename that silently skipped would leave
-- the database and the snapshot disagreeing with no error to show for it.
DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(name, ', ') INTO leftover FROM (
    SELECT c.relname AS name FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'FBCommentAutomation%'
    UNION ALL
    SELECT con.conname FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname LIKE 'CommentAutomation%' AND con.conname LIKE 'FBCommentAutomation%'
    UNION ALL
    SELECT t.typname FROM pg_type t WHERE t.typname = 'fbCommentAutomationType'
  ) AS remaining;

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'objects still carry the FB prefix: %', leftover;
  END IF;
END $$;
