CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_contact_workspace_email" ON "Contact" USING btree ("workspaceId","email");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_contact_workspace_phone_number" ON "Contact" USING btree ("workspaceId","phoneNumber");
