DROP INDEX IF EXISTS "ContactInbox_channel_sourceId_key";--> statement-breakpoint
DROP INDEX IF EXISTS "Inbox_channel_sourceId_key";--> statement-breakpoint
CREATE UNIQUE INDEX "ContactInbox_inboxId_sourceId_key" ON "ContactInbox" ("inboxId","sourceId");--> statement-breakpoint
CREATE UNIQUE INDEX "Inbox_workspaceId_channel_sourceId_key" ON "Inbox" ("workspaceId","channel","sourceId");
