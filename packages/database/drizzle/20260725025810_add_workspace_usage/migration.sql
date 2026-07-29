DROP TABLE IF EXISTS "WorkspaceUsage";

CREATE TABLE "WorkspaceUsage" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL UNIQUE,
	"contactsUsed" integer DEFAULT 0 NOT NULL,
	"channelsUsed" integer DEFAULT 0 NOT NULL,
	"teamMembersUsed" integer DEFAULT 0 NOT NULL,
	"botMessagesUsed" integer DEFAULT 0 NOT NULL,
	"macUsed" integer DEFAULT 0 NOT NULL,
	"syncedAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "WorkspaceUsage" ADD CONSTRAINT "WorkspaceUsage_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
