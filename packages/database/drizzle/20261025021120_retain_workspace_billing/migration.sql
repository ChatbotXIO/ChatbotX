-- Retain workspace billing evidence past workspace deletion: bot-message usage
-- and the deletion record get their own tables, and WorkspaceMac stops cascading
-- from Workspace and is keyed by owner/tenant instead.
--
-- Transactional on purpose: nothing here is CONCURRENTLY, so the runner wraps
-- the file in one transaction and a failure leaves no partial state. The
-- WorkspaceMac indexes and the FK validation live in the next migration
-- (add_workspace_mac_owner_indexes) because they cannot run in a transaction.
CREATE TABLE "WorkspaceBotMessageUsage" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"ownerId" bigint NOT NULL,
	"tenantId" bigint NOT NULL,
	"periodStart" timestamp(6) with time zone NOT NULL,
	"periodEnd" timestamp(6) with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "WorkspaceBotMessageUsage_workspaceId_periodStart_key" UNIQUE("workspaceId","periodStart")
);
--> statement-breakpoint
CREATE TABLE "WorkspaceDeletionRecord" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL CONSTRAINT "WorkspaceDeletionRecord_workspaceId_key" UNIQUE,
	"workspaceName" text NOT NULL,
	"ownerId" bigint NOT NULL,
	"ownerEmail" text,
	"tenantId" bigint NOT NULL,
	"deletionRequestedById" bigint,
	"deletionRequestedByEmail" text,
	"deletionRequestedAt" timestamp(6) with time zone,
	"scheduledDeletionAt" timestamp(6) with time zone,
	"purgedAt" timestamp(6) with time zone,
	"usageSnapshot" jsonb NOT NULL,
	"details" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Workspace" ADD COLUMN "deletionRequestedById" bigint;--> statement-breakpoint
ALTER TABLE "Workspace" ADD COLUMN "deletionRequestedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "WorkspaceMac" ADD COLUMN "ownerId" bigint;--> statement-breakpoint
ALTER TABLE "WorkspaceMac" ADD COLUMN "tenantId" bigint;--> statement-breakpoint
UPDATE "WorkspaceMac" AS mac
SET
  "ownerId" = COALESCE(mac."ownerId", workspace."ownerId"),
  "tenantId" = COALESCE(mac."tenantId", workspace."tenantId")
FROM "Workspace" AS workspace
WHERE mac."workspaceId" = workspace."id"
  AND (mac."ownerId" IS NULL OR mac."tenantId" IS NULL);--> statement-breakpoint
ALTER TABLE "WorkspaceMac" DROP CONSTRAINT IF EXISTS "WorkspaceMac_workspaceId_Workspace_id_fkey";--> statement-breakpoint
CREATE INDEX "WorkspaceBotMessageUsage_ownerId_periodStart_idx" ON "WorkspaceBotMessageUsage" ("ownerId","periodStart");--> statement-breakpoint
CREATE INDEX "WorkspaceBotMessageUsage_tenantId_periodStart_idx" ON "WorkspaceBotMessageUsage" ("tenantId","periodStart");--> statement-breakpoint
CREATE INDEX "WorkspaceDeletionRecord_ownerEmail_idx" ON "WorkspaceDeletionRecord" ("ownerEmail");--> statement-breakpoint
ALTER TABLE "WorkspaceBotMessageUsage" ADD CONSTRAINT "WorkspaceBotMessageUsage_ownerId_User_id_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkspaceMac" ADD CONSTRAINT "WorkspaceMac_ownerId_User_id_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
