CREATE INDEX CONCURRENTLY IF NOT EXISTS "ErrorLog_workspaceId_createdAt_idx" ON "ErrorLog" USING btree ("workspaceId" ASC NULLS LAST, "createdAt" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ErrorLog_createdAt_idx" ON "ErrorLog" USING btree ("createdAt" ASC NULLS LAST);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ErrorLog_contactId_idx" ON "ErrorLog" USING btree ("contactId");
