CREATE TABLE "MediaLibraryFile" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"mimeType" text NOT NULL,
	"size" integer NOT NULL,
	"isFavourite" boolean DEFAULT false NOT NULL,
	"lastAccessedAt" timestamp(6) with time zone,
	"workspaceId" bigint NOT NULL,
	"folderId" bigint
);
--> statement-breakpoint
CREATE TABLE "MediaLibraryFolder" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "MediaLibraryFile_workspaceId_idx" ON "MediaLibraryFile" ("workspaceId");--> statement-breakpoint
CREATE INDEX "MediaLibraryFile_folderId_idx" ON "MediaLibraryFile" ("folderId");--> statement-breakpoint
CREATE INDEX "MediaLibraryFolder_workspaceId_idx" ON "MediaLibraryFolder" ("workspaceId");--> statement-breakpoint
ALTER TABLE "MediaLibraryFile" ADD CONSTRAINT "MediaLibraryFile_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MediaLibraryFile" ADD CONSTRAINT "MediaLibraryFile_folderId_MediaLibraryFolder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "MediaLibraryFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MediaLibraryFolder" ADD CONSTRAINT "MediaLibraryFolder_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;