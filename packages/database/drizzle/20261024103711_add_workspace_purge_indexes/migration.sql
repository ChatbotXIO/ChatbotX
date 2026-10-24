DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AIAgent_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AIAgent_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AIAgent_workspaceId_idx" ON "AIAgent" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AIFile_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AIFile_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AIFile_workspaceId_idx" ON "AIFile" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"Flow_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "Flow_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Flow_workspaceId_idx" ON "Flow" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"InboxTeam_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "InboxTeam_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InboxTeam_workspaceId_idx" ON "InboxTeam" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"SavedReply_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "SavedReply_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SavedReply_workspaceId_idx" ON "SavedReply" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"SavedReplyImage_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "SavedReplyImage_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SavedReplyImage_workspaceId_idx" ON "SavedReplyImage" ("workspaceId");
