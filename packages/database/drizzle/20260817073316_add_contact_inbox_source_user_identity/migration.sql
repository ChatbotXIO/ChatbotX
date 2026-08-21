ALTER TABLE "ContactInbox" ADD COLUMN "sourceUserId" text;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "sourceUsername" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ContactInbox_inboxId_sourceUserId_key" ON "ContactInbox" ("inboxId","sourceUserId") WHERE "sourceUserId" IS NOT NULL;