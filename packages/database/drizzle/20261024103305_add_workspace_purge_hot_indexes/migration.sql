DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"CommentAutomationReply_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "CommentAutomationReply_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CommentAutomationReply_workspaceId_idx" ON "CommentAutomationReply" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"LeaderboardAuditLog_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "LeaderboardAuditLog_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LeaderboardAuditLog_workspaceId_idx" ON "LeaderboardAuditLog" ("workspaceId");