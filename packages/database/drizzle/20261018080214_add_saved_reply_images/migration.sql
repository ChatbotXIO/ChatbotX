CREATE TABLE "SavedReplyImage" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"savedReplyId" bigint NOT NULL,
	"mediaLibraryFileId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "SavedReplyImage_savedReplyId_idx" ON "SavedReplyImage" ("savedReplyId");--> statement-breakpoint
CREATE INDEX "SavedReplyImage_mediaLibraryFileId_idx" ON "SavedReplyImage" ("mediaLibraryFileId");--> statement-breakpoint
CREATE UNIQUE INDEX "SavedReplyImage_savedReplyId_mediaLibraryFileId_key" ON "SavedReplyImage" ("savedReplyId","mediaLibraryFileId");--> statement-breakpoint
ALTER TABLE "SavedReplyImage" ADD CONSTRAINT "SavedReplyImage_savedReplyId_SavedReply_id_fkey" FOREIGN KEY ("savedReplyId") REFERENCES "SavedReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SavedReplyImage" ADD CONSTRAINT "SavedReplyImage_mediaLibraryFileId_MediaLibraryFile_id_fkey" FOREIGN KEY ("mediaLibraryFileId") REFERENCES "MediaLibraryFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SavedReplyImage" ADD CONSTRAINT "SavedReplyImage_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;