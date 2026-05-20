CREATE TYPE "fileContextType" AS ENUM('import', 'generic', 'export');--> statement-breakpoint
CREATE TYPE "fileStatus" AS ENUM('pending', 'uploaded', 'failed');--> statement-breakpoint
CREATE TYPE "importFormat" AS ENUM('csv', 'xlsx', 'xls');--> statement-breakpoint
CREATE TYPE "importStatus" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "importType" AS ENUM('contacts');--> statement-breakpoint
CREATE TABLE "File" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"userId" bigint,
	"contextType" "fileContextType" NOT NULL,
	"subType" text,
	"path" text NOT NULL,
	"fileName" text NOT NULL,
	"mimeType" text NOT NULL,
	"fileSize" bigint,
	"status" "fileStatus" DEFAULT 'pending'::"fileStatus" NOT NULL,
	"meta" jsonb,
	"uploadedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "Import" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"userId" bigint,
	"fileId" bigint NOT NULL,
	"type" "importType" NOT NULL,
	"format" "importFormat" NOT NULL,
	"status" "importStatus" NOT NULL,
	"meta" jsonb NOT NULL,
	"totalCount" integer DEFAULT 0 NOT NULL,
	"processedCount" integer DEFAULT 0 NOT NULL,
	"successCount" integer DEFAULT 0 NOT NULL,
	"failedCount" integer DEFAULT 0 NOT NULL,
	"errorMessage" text,
	"completedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "File_path_key" ON "File" ("path");--> statement-breakpoint
CREATE INDEX "File_workspaceId_contextType_idx" ON "File" ("workspaceId","contextType");--> statement-breakpoint
CREATE INDEX "File_workspaceId_subType_idx" ON "File" ("workspaceId","subType");--> statement-breakpoint
CREATE INDEX "Import_workspaceId_status_idx" ON "Import" ("workspaceId","status");--> statement-breakpoint
CREATE INDEX "Import_workspaceId_type_idx" ON "Import" ("workspaceId","type");--> statement-breakpoint
CREATE INDEX "Import_inboxId_type_idx" ON "Import" ("inboxId","type");--> statement-breakpoint
CREATE INDEX "Import_fileId_idx" ON "Import" ("fileId");--> statement-breakpoint
ALTER TABLE "File" ADD CONSTRAINT "File_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "File" ADD CONSTRAINT "File_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Import" ADD CONSTRAINT "Import_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Import" ADD CONSTRAINT "Import_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Import" ADD CONSTRAINT "Import_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Import" ADD CONSTRAINT "Import_fileId_File_id_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

