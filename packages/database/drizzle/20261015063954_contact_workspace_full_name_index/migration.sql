-- Inbound webhooks look a contact up by full name. Indexed by md5 of the whitespace-normalised name
-- (ASCII whitespace collapsed and trimmed) so an arbitrarily long name cannot exceed the B-tree entry limit.
-- Its own migration because CONCURRENTLY cannot run in the transaction that creates the tables.
-- If this fails midway it leaves an INVALID index that IF NOT EXISTS would skip on a rerun:
-- check pg_index.indisvalid and DROP INDEX CONCURRENTLY "idx_contact_workspace_full_name_md5" first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_contact_workspace_full_name_md5" ON "Contact" USING btree ("workspaceId", md5(btrim(regexp_replace("fullName", '[ \t\n\v\f\r]+', ' ', 'g'))));
