CREATE TYPE "fbCommentAutomationType" AS ENUM('messenger', 'instagram');--> statement-breakpoint
ALTER TYPE "folderType" ADD VALUE 'fbComment';--> statement-breakpoint
CREATE TABLE "FBCommentAutomation" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"folderId" bigint,
	"type" "fbCommentAutomationType" DEFAULT 'messenger'::"fbCommentAutomationType" NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"startTime" text,
	"endTime" text,
	"repliesCount" integer DEFAULT 0 NOT NULL,
	"post" jsonb DEFAULT '{"type":"all","value":[]}' NOT NULL,
	"privateReply" jsonb DEFAULT '{"type":"text","value":""}' NOT NULL,
	"publicReply" jsonb DEFAULT '{"type":"none","value":null}' NOT NULL,
	"includeKeywords" jsonb DEFAULT '{"type":"all","value":[]}' NOT NULL,
	"excludeKeywords" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"options" jsonb DEFAULT '{"replyToNewContactsOnly":false,"replyOncePerUserPerPost":false,"likeUserComment":false,"replyToUsersWhoCommentedOnOtherPosts":true,"ignoreCommentReplies":true,"trackUserTags":false}' NOT NULL,
	"hideComments" jsonb DEFAULT '{"all":false,"hasPhoneNumber":false,"hasImage":false,"hasVideo":false,"hasLink":false,"hasKeywords":false,"keywords":[],"showCommentsAfter":"none"}' NOT NULL,
	"replyAfter" jsonb DEFAULT '{"type":"immediately","value":0}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FBCommentAutomationReply" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"automationId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"postId" text NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "FBCommentAutomation_workspaceId_idx" ON "FBCommentAutomation" ("workspaceId");--> statement-breakpoint
CREATE INDEX "FBCommentAutomation_folderId_idx" ON "FBCommentAutomation" ("folderId");--> statement-breakpoint
CREATE UNIQUE INDEX "FBCommentAutomationReply_dedup_idx" ON "FBCommentAutomationReply" ("automationId","contactId","postId");--> statement-breakpoint
ALTER TABLE "FBCommentAutomation" ADD CONSTRAINT "FBCommentAutomation_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FBCommentAutomation" ADD CONSTRAINT "FBCommentAutomation_folderId_Folder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationReply" ADD CONSTRAINT "FBCommentAutomationReply_Q6yXIfuQcsD0_fkey" FOREIGN KEY ("automationId") REFERENCES "FBCommentAutomation"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationReply" ADD CONSTRAINT "FBCommentAutomationReply_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "FBCommentAutomationReply" ADD CONSTRAINT "FBCommentAutomationReply_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
