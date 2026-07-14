ALTER TABLE "ContactInbox" ADD COLUMN "verifiedExternalId" text;--> statement-breakpoint
ALTER TABLE "Contact" DROP COLUMN "verifiedUserId";