ALTER TABLE "SavedReply" DROP CONSTRAINT "SavedReply_userId_User_id_fkey";--> statement-breakpoint
ALTER INDEX "Inbox_workspaceId_channel_sourceId_key" RENAME TO "Inbox_channel_sourceId_key";--> statement-breakpoint
ALTER TABLE "SavedReply" ADD COLUMN "workspaceId" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "SavedReply" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "SavedReply" ADD CONSTRAINT "SavedReply_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
