-- White-label tenancy: promote PlatformSetting into a first-class `Tenant` table,
-- key User/Workspace/CustomDomain by tenant, and seed the root tenant.
--
-- Forward, data-safe migration. PlatformSetting is RENAMEd (not dropped) so any
-- existing branding rows survive. The root tenant is seeded BEFORE the User /
-- Workspace tenant FKs are added, resolving the Tenant<->User circular FK from an
-- existing (non-empty) database.

-- 1) Promote PlatformSetting -> Tenant (preserves rows). Postgres keeps the old
--    constraint names across RENAME, so re-point them to the Tenant_* names the
--    schema snapshot expects.
ALTER TABLE "PlatformSetting" RENAME TO "Tenant";--> statement-breakpoint
ALTER TABLE "Tenant" RENAME CONSTRAINT "PlatformSetting_pkey" TO "Tenant_pkey";--> statement-breakpoint
ALTER TABLE "Tenant" DROP CONSTRAINT "PlatformSetting_userId_User_id_fkey";--> statement-breakpoint
ALTER TABLE "Tenant" DROP CONSTRAINT "PlatformSetting_userId_key";--> statement-breakpoint
ALTER TABLE "Tenant" RENAME COLUMN "userId" TO "ownerId";--> statement-breakpoint
ALTER TABLE "Tenant" ALTER COLUMN "ownerId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Tenant" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "Tenant" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
-- Fold the old isEnabled boolean into the new status lifecycle column.
UPDATE "Tenant" SET "status" = CASE WHEN "isEnabled" THEN 'active' ELSE 'suspended' END;--> statement-breakpoint
ALTER TABLE "Tenant" DROP COLUMN "isEnabled";--> statement-breakpoint
CREATE UNIQUE INDEX "Tenant_ownerId_key" ON "Tenant" ("ownerId") WHERE "ownerId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant" ("slug") WHERE "slug" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownerId_User_id_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint

-- 2) Seed the root tenant (id = 1, no owner) so every default tenant FK resolves.
INSERT INTO "Tenant" ("id", "status") VALUES (1, 'active') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- 3) User: per-tenant email uniqueness replaces the old global unique email.
DROP INDEX IF EXISTS "User_email_key";--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "tenantId" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_tenant_key" ON "User" ("email","tenantId");--> statement-breakpoint
CREATE INDEX "User_tenantId_idx" ON "User" ("tenantId");--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint

-- 4) CustomDomain: host -> tenant (was host -> user). Backfill any existing rows
--    from the tenant they belong to (Tenant.ownerId = the old CustomDomain.userId).
ALTER TABLE "CustomDomain" ADD COLUMN "tenantId" bigint;--> statement-breakpoint
-- Provision a Tenant for any custom-domain owner that lacks one (a domain whose
-- user never had a PlatformSetting). Owning a domain implies being a reseller, so
-- this preserves the domain and gives it an isolated tenant instead of failing the
-- NOT NULL below or misrouting it to the root tenant. Old `CustomDomain_userId_key`
-- guaranteed one domain per user, so each new tenant maps to exactly one domain.
-- `Tenant.id` has no DB default (the app sets it via a uuniq Snowflake), so we mint
-- ids of the same shape here: ((ms since the 2004-02-01 epoch) << 22) + row index —
-- time-ordered, larger than every existing id, collision-safe.
INSERT INTO "Tenant" ("id", "ownerId", "status")
SELECT
  ((EXTRACT(EPOCH FROM (clock_timestamp() - TIMESTAMPTZ '2004-02-01T00:00:00Z')) * 1000)::bigint << 22) + row_number() OVER (),
  owner."userId",
  'active'
FROM (
  SELECT DISTINCT cd."userId"
  FROM "CustomDomain" cd
  LEFT JOIN "Tenant" t ON t."ownerId" = cd."userId"
  WHERE t."id" IS NULL
) owner;--> statement-breakpoint
UPDATE "CustomDomain" cd SET "tenantId" = t."id" FROM "Tenant" t WHERE t."ownerId" = cd."userId";--> statement-breakpoint
ALTER TABLE "CustomDomain" ALTER COLUMN "tenantId" SET NOT NULL;--> statement-breakpoint
DROP INDEX "CustomDomain_userId_key";--> statement-breakpoint
ALTER TABLE "CustomDomain" DROP CONSTRAINT "CustomDomain_userId_User_id_fkey";--> statement-breakpoint
ALTER TABLE "CustomDomain" DROP COLUMN "userId";--> statement-breakpoint
CREATE UNIQUE INDEX "CustomDomain_tenantId_key" ON "CustomDomain" ("tenantId");--> statement-breakpoint
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint

-- 5) Workspace: owner-derived tenant stamp (existing rows default to root).
ALTER TABLE "Workspace" ADD COLUMN "tenantId" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "Workspace_tenantId_idx" ON "Workspace" ("tenantId");--> statement-breakpoint
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
