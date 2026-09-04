CREATE TYPE "WorkspaceApiTokenPermission" AS ENUM('full', 'read_only');--> statement-breakpoint
CREATE TABLE "WorkspaceApiToken" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"permission" "WorkspaceApiTokenPermission" NOT NULL,
	"tokenHash" text NOT NULL CONSTRAINT "WorkspaceApiToken_tokenHash_key" UNIQUE,
	"tokenPrefix" text,
	"isDefault" boolean DEFAULT false NOT NULL,
	"encryptedToken" jsonb,
	-- Resource-area scope axis (orthogonal to "permission"). NULL =
	-- unrestricted ("All scopes") — see workspaceApiTokenModel's doc in
	-- src/schema/workspace-api-token.ts.
	"scopes" text[]
);
--> statement-breakpoint
CREATE INDEX "WorkspaceApiToken_workspaceId_idx" ON "WorkspaceApiToken" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "WorkspaceApiToken_workspaceId_default_key" ON "WorkspaceApiToken" ("workspaceId") WHERE "isDefault";--> statement-breakpoint
ALTER TABLE "WorkspaceApiToken" ADD CONSTRAINT "WorkspaceApiToken_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
-- Backfill: reuses each Workspace's own "id" as the new token row's "id"
-- (and as "workspaceId"), not a computed snowflake id — safe because every
-- legacy workspace had at most one plaintext token, so "id" is already
-- unique across the backfilled rows. Marked "isDefault" so it backs
-- {{api_key}}; "encryptedToken" stays null until the resolver lazily
-- recovers the plaintext from "Workspace.token" and encrypts it forward.
INSERT INTO "WorkspaceApiToken" ("id", "workspaceId", "name", "permission", "tokenHash", "isDefault", "createdAt", "updatedAt")
SELECT
  "id",
  "id",
  'Default token',
  'full',
  encode(sha256(convert_to("token", 'UTF8')), 'hex'), true, now(), now()
FROM "Workspace" WHERE "token" IS NOT NULL;
