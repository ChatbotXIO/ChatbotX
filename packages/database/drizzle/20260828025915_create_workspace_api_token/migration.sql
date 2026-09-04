CREATE TYPE "WorkspaceApiTokenPermission" AS ENUM('full', 'read_only');--> statement-breakpoint
CREATE TABLE "WorkspaceApiToken" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"permission" "WorkspaceApiTokenPermission" NOT NULL,
	"tokenHash" text NOT NULL CONSTRAINT "WorkspaceApiToken_tokenHash_key" UNIQUE,
	"tokenPrefix" text
);
--> statement-breakpoint
CREATE INDEX "WorkspaceApiToken_workspaceId_idx" ON "WorkspaceApiToken" ("workspaceId");--> statement-breakpoint
ALTER TABLE "WorkspaceApiToken" ADD CONSTRAINT "WorkspaceApiToken_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
-- Backfill: reuses each Workspace's own "id" as the new token row's "id"
-- (and as "workspaceId"), not a computed snowflake id — safe because every
-- legacy workspace had at most one plaintext token, so "id" is already
-- unique across the backfilled rows.
INSERT INTO "WorkspaceApiToken" ("id", "workspaceId", "name", "permission", "tokenHash", "createdAt", "updatedAt")
SELECT
  "id",
  "id",
  'Default token',
  'full',
  encode(sha256(convert_to("token", 'UTF8')), 'hex'), now(), now()
FROM "Workspace" WHERE "token" IS NOT NULL;--> statement-breakpoint
-- The hash table above is now the sole token store: dropping the plaintext
-- column right after the backfill means a DB dump can no longer reveal any
-- workspace API token. Tokens are shown exactly once, at generation time.
ALTER TABLE "Workspace" DROP COLUMN "token";
