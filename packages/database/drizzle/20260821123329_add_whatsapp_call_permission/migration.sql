CREATE TYPE "whatsappCallPermissionResponse" AS ENUM('accept', 'reject');--> statement-breakpoint
CREATE TABLE "WhatsappCallPermission" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"response" "whatsappCallPermissionResponse" NOT NULL,
	"isPermanent" boolean DEFAULT false NOT NULL,
	"expiresAt" timestamp(6) with time zone,
	"respondedAt" timestamp(6) with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappCallPermission_contactInboxId_key" ON "WhatsappCallPermission" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "WhatsappCallPermission_workspaceId_idx" ON "WhatsappCallPermission" ("workspaceId");--> statement-breakpoint
ALTER TABLE "WhatsappCallPermission" ADD CONSTRAINT "WhatsappCallPermission_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappCallPermission" ADD CONSTRAINT "WhatsappCallPermission_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;