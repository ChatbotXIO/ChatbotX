CREATE TYPE "commentExcludeKeywordsType" AS ENUM('equal', 'contain');--> statement-breakpoint
ALTER TYPE "commentAutomationMissReason" ADD VALUE 'mentionCountNotMatched' BEFORE 'contactNotNew';--> statement-breakpoint
ALTER TABLE "CommentAutomation" ADD COLUMN "excludeKeywordsType" "commentExcludeKeywordsType" DEFAULT 'contain'::"commentExcludeKeywordsType" NOT NULL;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "totalTagged" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "totalNewTagged" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "CommentAutomation" ALTER COLUMN "hideComments" SET DEFAULT '{"all":false,"hasPhoneNumber":false,"hasImage":false,"hasVideo":false,"hasLink":false,"hasKeywords":false,"hasGif":false,"hasEmoji":false,"keywords":[],"showCommentsAfter":"none"}';