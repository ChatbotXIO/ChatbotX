ALTER TABLE "Broadcast" RENAME COLUMN "inboxType" TO "channel";--> statement-breakpoint
ALTER TABLE "Contact" RENAME COLUMN "source" TO "channel";--> statement-breakpoint
ALTER TABLE "Conversation" RENAME COLUMN "inboxType" TO "channel";--> statement-breakpoint
ALTER TABLE "Inbox" RENAME COLUMN "inboxType" TO "channel";--> statement-breakpoint
DROP INDEX IF EXISTS "Broadcast_inboxType_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Inbox_chatbotId_inboxType_sourceId_key";--> statement-breakpoint
ALTER TABLE "Inbox" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "channel" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "channel" SET DATA TYPE text USING "channel"::text;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "channel" SET DEFAULT 'webchat';--> statement-breakpoint
ALTER TABLE "Inbox" ALTER COLUMN "channel" SET DATA TYPE text USING "channel"::text;--> statement-breakpoint
CREATE INDEX "Broadcast_channel_idx" ON "Broadcast" ("channel" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Inbox_chatbotId_channel_sourceId_key" ON "Inbox" ("channel" text_ops,"sourceId" text_ops);--> statement-breakpoint
DROP TYPE IF EXISTS "InboxType";
