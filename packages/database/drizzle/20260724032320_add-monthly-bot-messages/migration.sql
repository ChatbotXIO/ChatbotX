ALTER TABLE "UserQuota" ADD COLUMN "monthlyBotMessagesLimit" integer;--> statement-breakpoint
ALTER TABLE "UserQuota" ADD COLUMN "monthlyBotMessagesUsed" integer DEFAULT 0 NOT NULL;
