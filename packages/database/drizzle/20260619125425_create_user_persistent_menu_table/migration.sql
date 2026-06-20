CREATE TABLE "UserPersistentMenu" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"menus" jsonb NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "UserPersistentMenu_workspaceId_idx" ON "UserPersistentMenu" ("workspaceId");--> statement-breakpoint
ALTER TABLE "UserPersistentMenu" ADD CONSTRAINT "UserPersistentMenu_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
