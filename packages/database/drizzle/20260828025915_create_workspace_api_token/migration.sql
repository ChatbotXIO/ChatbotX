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
-- Snowflake-shaped id: a time-ordered bigint using the same 2004-02-01 epoch
-- as the app's createId() (uuniq), with row_number() in the low bits as a
-- disambiguator — same technique as 20260614163529_add_tenant_tables. Note
-- the << 22 shift is deliberately wider than uuniq's 14 low bits (4-bit
-- place_id + 10-bit sequence), so these ids sort far above app-generated ids
-- from the same instant and are NOT decodable via resolveId(); they are
-- simply unique, ordered bigints that satisfy the primary key.
INSERT INTO "WorkspaceApiToken" ("id", "workspaceId", "tokenHash", "createdAt", "updatedAt")
SELECT
  "id",
  "id",
  encode(sha256(convert_to("token", 'UTF8')), 'hex'), now(), now()
FROM "Workspace" WHERE "token" IS NOT NULL;--> statement-breakpoint
-- The hash table above is now the sole token store: dropping the plaintext
-- column right after the backfill means a DB dump can no longer reveal any
-- workspace API token. Tokens are shown exactly once, at generation time.
ALTER TABLE "Workspace" DROP COLUMN "token";
