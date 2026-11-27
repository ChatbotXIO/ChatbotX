SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "connectionAuthorizations" jsonb;
