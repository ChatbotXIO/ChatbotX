ALTER TABLE "InboxTeamMember" DROP CONSTRAINT IF EXISTS "InboxTeamMember_chatbotId_fkey";--> statement-breakpoint
ALTER TABLE "InboxTeamMember" DROP COLUMN IF EXISTS  "chatbotId";
