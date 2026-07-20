ALTER TABLE "UserQuota" ADD COLUMN "botMessagesLimit" integer;--> statement-breakpoint
ALTER TABLE "UserQuota" ADD COLUMN "botMessagesUsed" integer DEFAULT 0 NOT NULL;