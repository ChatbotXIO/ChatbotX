-- Member-scoped conversation lists filter these partial assignments. This is separate
-- because CREATE INDEX CONCURRENTLY cannot run inside the migration transaction.
-- If deployment fails midway it leaves an INVALID index that IF NOT EXISTS skips;
-- inspect pg_index.indisvalid and DROP INDEX CONCURRENTLY before retrying.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_workspaceId_assignedUserId_lastActivityAt_id_idx" ON "Conversation" ("workspaceId","assignedUserId","lastActivityAt" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "assignedUserId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_ws_team_lastActivity_id_idx" ON "Conversation" ("workspaceId","assignedInboxTeamId","lastActivityAt" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "assignedInboxTeamId" IS NOT NULL;