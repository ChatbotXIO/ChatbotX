-- The comments of one post live on one Conversation per commenter, all with `sourceId = externalPostId`; reading them
-- looks conversations up by (workspaceId, sourceId) newest-active first (lastActivityAt DESC NULLS LAST, id DESC), so
-- the index carries that order and the capped read needs no sort. The partial index keeps it small on a huge
-- Conversation table.
-- The author filter and picker of the Posts page group ChannelPost by (workspaceId, authorExternalId).
-- CONCURRENTLY cannot run in a transaction, so the migration runs unwrapped (same precedent as
-- 20261019070504_conversation_response_due_index). It is not atomic, so each statement is re-runnable: a build that
-- failed midway leaves an INVALID index that IF NOT EXISTS would skip, so the guard before each build drops it first.
-- The four ChannelPost_*Count_id_idx sort indexes serve the Posts page count sorts, one index per order.
DO $$
BEGIN
  SET LOCAL lock_timeout = '5s';
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ChannelPost_workspaceId_authorExternalId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ChannelPost_workspaceId_authorExternalId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChannelPost_workspaceId_authorExternalId_idx" ON "ChannelPost" ("workspaceId","authorExternalId") WHERE "authorExternalId" IS NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  SET LOCAL lock_timeout = '5s';
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"Conversation_workspaceId_sourceId_lastActivityAt_id_idx"') AND NOT indisvalid) THEN
    DROP INDEX "Conversation_workspaceId_sourceId_lastActivityAt_id_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_workspaceId_sourceId_lastActivityAt_id_idx" ON "Conversation" ("workspaceId","sourceId","lastActivityAt" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "sourceId" IS NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  SET LOCAL lock_timeout = '5s';
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ChannelPost_workspaceId_commentsCount_id_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ChannelPost_workspaceId_commentsCount_id_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChannelPost_workspaceId_commentsCount_id_idx" ON "ChannelPost" ("workspaceId","commentsCount" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
DO $$
BEGIN
  SET LOCAL lock_timeout = '5s';
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ChannelPost_workspaceId_phoneCommentsCount_id_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ChannelPost_workspaceId_phoneCommentsCount_id_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChannelPost_workspaceId_phoneCommentsCount_id_idx" ON "ChannelPost" ("workspaceId","phoneCommentsCount" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
DO $$
BEGIN
  SET LOCAL lock_timeout = '5s';
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ChannelPost_workspaceId_engagementCount_id_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ChannelPost_workspaceId_engagementCount_id_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChannelPost_workspaceId_engagementCount_id_idx" ON "ChannelPost" ("workspaceId","engagementCount" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
DO $$
BEGIN
  SET LOCAL lock_timeout = '5s';
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ChannelPost_workspaceId_sharesCount_id_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ChannelPost_workspaceId_sharesCount_id_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChannelPost_workspaceId_sharesCount_id_idx" ON "ChannelPost" ("workspaceId","sharesCount" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
-- The live filters of the Posts page read the rows that carry a live status, in the default list order.
DO $$
BEGIN
  SET LOCAL lock_timeout = '5s';
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ChannelPost_workspaceId_liveStatus_sortAt_id_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ChannelPost_workspaceId_liveStatus_sortAt_id_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChannelPost_workspaceId_liveStatus_sortAt_id_idx" ON "ChannelPost" ("workspaceId","liveStatus",COALESCE("publishedAt", "createdAt") DESC,"id" DESC NULLS LAST) WHERE "liveStatus" IS NOT NULL;
--> statement-breakpoint
-- The minute scan claims the live broadcasts that are due for a re-read, oldest first.
DO $$
BEGIN
  SET LOCAL lock_timeout = '5s';
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ChannelPost_liveRecheckAt_id_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ChannelPost_liveRecheckAt_id_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChannelPost_liveRecheckAt_id_idx" ON "ChannelPost" ("liveRecheckAt","id") WHERE "liveStatus" = 'live' AND "liveRecheckAt" IS NOT NULL;
