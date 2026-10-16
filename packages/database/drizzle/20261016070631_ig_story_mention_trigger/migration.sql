CREATE TYPE "igStoryAutomationTrigger" AS ENUM('storyReply', 'storyMention');--> statement-breakpoint
ALTER TYPE "lastUserInputType" ADD VALUE 'storyMention';--> statement-breakpoint
ALTER TABLE "IgStoryAutomation" ADD COLUMN "trigger" "igStoryAutomationTrigger" DEFAULT 'storyReply'::"igStoryAutomationTrigger" NOT NULL;