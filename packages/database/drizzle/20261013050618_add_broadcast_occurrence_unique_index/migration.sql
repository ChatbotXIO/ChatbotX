CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Broadcast_parentBroadcastId_occurrenceAt_key" ON "Broadcast" ("parentBroadcastId", "occurrenceAt");
