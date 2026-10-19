-- Inbox SLA filter (breaching / breached) reads only conversations with an open SLA window, so the index is partial
-- and stays tiny on a huge Conversation table. Its own migration because CONCURRENTLY cannot run in a transaction
-- (same precedent as 20261019032527_workspace_member_workspace_user_index).
-- If this fails midway it leaves an INVALID index that IF NOT EXISTS would skip on a rerun:
-- check pg_index.indisvalid and DROP INDEX CONCURRENTLY "Conversation_workspaceId_responseDueAt_idx" first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_workspaceId_responseDueAt_idx" ON "Conversation" ("workspaceId","responseDueAt") WHERE "responseDueAt" IS NOT NULL;
