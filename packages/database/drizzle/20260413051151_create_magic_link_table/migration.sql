CREATE TABLE "MagicLink" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "MagicLink_workspaceId_name_key" ON "MagicLink" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "MagicLink_workspaceId_idx" ON "MagicLink" ("workspaceId");--> statement-breakpoint
ALTER TABLE "MagicLink" ADD CONSTRAINT "MagicLink_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;