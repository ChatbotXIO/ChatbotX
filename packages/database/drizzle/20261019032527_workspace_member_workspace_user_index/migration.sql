-- WorkspaceMember is read on every authenticated request and by the working-hours member check by
-- (workspaceId, userId); neither FK column had an index.
-- Its own migration because CONCURRENTLY cannot run in a transaction (same precedent as
-- 20261015063954_contact_workspace_full_name_index).
-- If this fails midway it leaves an INVALID index that IF NOT EXISTS would skip on a rerun:
-- check pg_index.indisvalid and DROP INDEX CONCURRENTLY "WorkspaceMember_workspaceId_userId_idx" first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WorkspaceMember_workspaceId_userId_idx" ON "WorkspaceMember" USING btree ("workspaceId" ASC NULLS LAST,"userId" ASC NULLS LAST);
