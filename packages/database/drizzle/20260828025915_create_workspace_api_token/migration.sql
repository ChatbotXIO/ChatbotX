CREATE TABLE "WorkspaceApiToken" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"tokenHash" text NOT NULL CONSTRAINT "WorkspaceApiToken_tokenHash_key" UNIQUE
);
--> statement-breakpoint
CREATE INDEX "WorkspaceApiToken_workspaceId_idx" ON "WorkspaceApiToken" ("workspaceId");--> statement-breakpoint
ALTER TABLE "WorkspaceApiToken" ADD CONSTRAINT "WorkspaceApiToken_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
-- Snowflake-style id: matches the app's createId() format (uuniq, epoch
-- 2004-02-01, 22 low bits for a per-request disambiguator) so backfilled rows
-- are valid bigint ids indistinguishable from app-generated ones — see
-- 20260614163529_add_tenant_tables for the same technique.
INSERT INTO "WorkspaceApiToken" ("id", "workspaceId", "tokenHash", "createdAt", "updatedAt")
SELECT
  ((EXTRACT(EPOCH FROM (clock_timestamp() - TIMESTAMPTZ '2004-02-01T00:00:00Z')) * 1000)::bigint << 22) + row_number() OVER (ORDER BY "id"),
  "id",
  encode(sha256(convert_to("token", 'UTF8')), 'hex'), now(), now()
FROM "Workspace" WHERE "token" IS NOT NULL;
