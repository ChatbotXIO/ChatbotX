CREATE INDEX CONCURRENTLY IF NOT EXISTS "Broadcast_workspaceId_active_idx" ON "Broadcast" ("workspaceId", "channel")
  WHERE "status" IN ('scheduled', 'sending') AND "deletedAt" IS NULL;
