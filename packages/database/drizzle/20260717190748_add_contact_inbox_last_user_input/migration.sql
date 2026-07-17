CREATE TYPE "lastUserInputType" AS ENUM('text', 'location', 'refLink', 'image', 'video', 'audio', 'gif', 'file');--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "lastUserInput" text;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "lastUserInputType" "lastUserInputType";