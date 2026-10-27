-- Teams of a member: `listTeamIdsByUserId` (every member-token request) and `listTeamNamesByUserId`
-- (`{{admin_team_name}}`) filter InboxTeamMember by userId, which had no index (only the primary key).
-- Its own migration because CONCURRENTLY cannot run in a transaction
-- (same precedent as 20261019070504_conversation_response_due_index).
-- If this fails midway it leaves an INVALID index that IF NOT EXISTS would skip on a rerun:
-- check pg_index.indisvalid and DROP INDEX CONCURRENTLY "InboxTeamMember_userId_inboxTeamId_idx" first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InboxTeamMember_userId_inboxTeamId_idx" ON "InboxTeamMember" ("userId","inboxTeamId");
