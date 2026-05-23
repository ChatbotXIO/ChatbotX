-- ============================================================
-- Drop Organization and OrganizationMember tables.
-- Add CustomDomain and PlatformSetting enterprise tables.
-- Migrate Workspace.organizationId → Workspace.userId.
-- Migrate Invitation: drop organizationId column.
-- ============================================================

-- 1. Drop FK constraints that reference Organization
ALTER TABLE "Invitation" DROP CONSTRAINT IF EXISTS "Invitation_organizationId_Organization_id_fkey";--> statement-breakpoint
ALTER TABLE "OrganizationMember" DROP CONSTRAINT IF EXISTS "OrganizationMember_organizationId_Organization_id_fkey";--> statement-breakpoint
ALTER TABLE "OrganizationMember" DROP CONSTRAINT IF EXISTS "OrganizationMember_userId_User_id_fkey";--> statement-breakpoint
ALTER TABLE "Workspace" DROP CONSTRAINT IF EXISTS "Workspace_organizationId_Organization_id_fkey";--> statement-breakpoint

-- 2. Create CustomDomain table (enterprise)
CREATE TABLE IF NOT EXISTS "CustomDomain" (
  "id" bigint PRIMARY KEY,
  "createdAt" timestamptz(6) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(6) NOT NULL DEFAULT now(),
  "userId" bigint NOT NULL,
  "domain" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "txtRecord" text NOT NULL,
  "verifiedAt" timestamptz(6)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "CustomDomain_userId_key" ON "CustomDomain" ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "CustomDomain_domain_key" ON "CustomDomain" ("domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CustomDomain_status_idx" ON "CustomDomain" ("status");--> statement-breakpoint

-- 3. Create PlatformSetting table (enterprise)
CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "id" bigint PRIMARY KEY,
  "createdAt" timestamptz(6) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(6) NOT NULL DEFAULT now(),
  "userId" bigint NOT NULL UNIQUE,
  "brandName" text,
  "logoLightUrl" text,
  "logoDarkUrl" text,
  "faviconUrl" text,
  "primaryColor" text,
  "accentColor" text,
  "supportEmail" text,
  "supportUrl" text,
  "showPoweredBy" boolean NOT NULL DEFAULT true,
  "customCss" text,
  "customJs" text,
  "jsEnabled" boolean NOT NULL DEFAULT false,
  "cssVersion" integer NOT NULL DEFAULT 0,
  "jsVersion" integer NOT NULL DEFAULT 0,
  "isEnabled" boolean NOT NULL DEFAULT true,
  "disabledReason" text
);--> statement-breakpoint

-- 4. Add userId column to Workspace (nullable initially for backfill)
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "ownerId" bigint;--> statement-breakpoint
ALTER TABLE "Workspace" DROP COLUMN "plan";

-- 5. Backfill Workspace.userId from OrganizationMember (pick any owner/admin)
UPDATE "Workspace" w
SET "ownerId" = (
  SELECT om."userId"
  FROM "WorkspaceMember" om
  WHERE om."workspaceId" = w."id"
    AND om.role = 'owner'
)
WHERE w."ownerId" IS NULL;--> statement-breakpoint

-- 6. Make Workspace.userId NOT NULL and add FK
ALTER TABLE "Workspace" ALTER COLUMN "ownerId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_User_id_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint

-- 7. Drop Workspace.organizationId
ALTER TABLE "Workspace" DROP COLUMN IF EXISTS "organizationId";--> statement-breakpoint

-- 8. Drop Invitation.organizationId
ALTER TABLE "Invitation" DROP COLUMN IF EXISTS "organizationId";--> statement-breakpoint

-- 9. Drop OrganizationMember table
DROP TABLE IF EXISTS "OrganizationMember";--> statement-breakpoint

-- 10. Drop Organization table (drop indices first)
DROP INDEX IF EXISTS "Organization_domain_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "Organization_slug_key";--> statement-breakpoint
DROP TABLE IF EXISTS "Organization";--> statement-breakpoint

-- 11. Add FK for CustomDomain.userId → User.id
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_userId_User_id_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint

-- 12. Add FK for PlatformSetting.userId → User.id
ALTER TABLE "PlatformSetting" ADD CONSTRAINT "PlatformSetting_userId_User_id_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
