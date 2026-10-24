DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AIConversationEmbedding_lookup_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AIConversationEmbedding_lookup_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AIConversationEmbedding_lookup_idx" ON "AIConversationEmbedding" ("workspaceId", "conversationId", "sourceId", "status");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AIEmbedding_aiFileId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AIEmbedding_aiFileId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AIEmbedding_aiFileId_idx" ON "AIEmbedding" ("aiFileId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ContactToTag_tagId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ContactToTag_tagId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactToTag_tagId_idx" ON "ContactToTag" ("tagId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FlowRun_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FlowRun_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FlowRun_workspaceId_idx" ON "FlowRun" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FlowRun_flowId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FlowRun_flowId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FlowRun_flowId_idx" ON "FlowRun" ("flowId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FlowRun_flowVersionId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FlowRun_flowVersionId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FlowRun_flowVersionId_idx" ON "FlowRun" ("flowVersionId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FlowVersion_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FlowVersion_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FlowVersion_workspaceId_idx" ON "FlowVersion" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FlowVersion_flowId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FlowVersion_flowId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FlowVersion_flowId_idx" ON "FlowVersion" ("flowId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"LeaderboardParticipant_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "LeaderboardParticipant_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LeaderboardParticipant_workspaceId_idx" ON "LeaderboardParticipant" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"LeaderboardParticipant_referrerContactId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "LeaderboardParticipant_referrerContactId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LeaderboardParticipant_referrerContactId_idx" ON "LeaderboardParticipant" ("referrerContactId") WHERE "referrerContactId" IS NOT NULL;