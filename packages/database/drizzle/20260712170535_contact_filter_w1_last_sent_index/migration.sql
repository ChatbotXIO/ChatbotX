SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE INDEX "ContactInbox_contactId_lastOutboundMessageAt_idx" ON "ContactInbox" ("contactId","lastOutboundMessageAt");
