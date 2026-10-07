CREATE TYPE "miniAppUploadStatus" AS ENUM('pending', 'submitted');--> statement-breakpoint
CREATE TABLE "MiniAppUpload" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"miniAppId" bigint NOT NULL,
	"contactId" bigint,
	"submissionId" bigint,
	"inputName" text NOT NULL,
	"uploadToken" text NOT NULL,
	"path" text NOT NULL,
	"fileName" text NOT NULL,
	"mimeType" text NOT NULL,
	"size" integer NOT NULL,
	"status" "miniAppUploadStatus" NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "MiniAppUpload_uploadToken_key" ON "MiniAppUpload" ("uploadToken");--> statement-breakpoint
CREATE UNIQUE INDEX "MiniAppUpload_path_key" ON "MiniAppUpload" ("path");--> statement-breakpoint
CREATE INDEX "MiniAppUpload_miniAppId_inputName_status_idx" ON "MiniAppUpload" ("miniAppId","inputName","status");--> statement-breakpoint
CREATE INDEX "MiniAppUpload_submissionId_idx" ON "MiniAppUpload" ("submissionId");--> statement-breakpoint
ALTER TABLE "MiniAppUpload" ADD CONSTRAINT "MiniAppUpload_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MiniAppUpload" ADD CONSTRAINT "MiniAppUpload_miniAppId_MiniApp_id_fkey" FOREIGN KEY ("miniAppId") REFERENCES "MiniApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MiniAppUpload" ADD CONSTRAINT "MiniAppUpload_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MiniAppUpload" ADD CONSTRAINT "MiniAppUpload_submissionId_MiniAppSubmission_id_fkey" FOREIGN KEY ("submissionId") REFERENCES "MiniAppSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;