SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE INDEX "idx_contact_workspace_created_at" ON "Contact" ("workspaceId","createdAt");--> statement-breakpoint
CREATE INDEX "RefLinkStat_contactId_idx" ON "RefLinkStat" ("contactId");
