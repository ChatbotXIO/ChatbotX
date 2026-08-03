CREATE TYPE "igStoryAutomationType" AS ENUM('instagram', 'instagramFacebook');--> statement-breakpoint
ALTER TYPE "folderType" ADD VALUE 'igStory';--> statement-breakpoint
CREATE TABLE "IgStoryAutomation" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"folderId" bigint,
	"type" "igStoryAutomationType" NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"startTime" text,
	"endTime" text,
	"repliesCount" integer DEFAULT 0 NOT NULL,
	"story" jsonb DEFAULT '{"type":"all","value":[]}' NOT NULL,
	"reply" jsonb DEFAULT '{"type":"none","value":null}' NOT NULL,
	"includeKeywords" jsonb DEFAULT '{"type":"all","value":[]}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IgStoryAutomation_workspaceId_idx" ON "IgStoryAutomation" ("workspaceId");--> statement-breakpoint
CREATE INDEX "IgStoryAutomation_folderId_idx" ON "IgStoryAutomation" ("folderId");--> statement-breakpoint
ALTER TABLE "IgStoryAutomation" ADD CONSTRAINT "IgStoryAutomation_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IgStoryAutomation" ADD CONSTRAINT "IgStoryAutomation_folderId_Folder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;