-- Restructure OrganizationCredential → Credential.
-- Remove organizationId scope entirely; credentials are user-scoped or platform-scoped.
-- userId IS NOT NULL → owned by that user/reseller
-- userId IS NULL     → platform/system credential

-- 1. Drop FK + indexes from the original creation migration
ALTER TABLE "OrganizationCredential" DROP CONSTRAINT IF EXISTS "OrganizationCredential_organizationId_Organization_id_fkey";
DROP INDEX IF EXISTS "OrganizationCredential_organizationId_type_key";
DROP INDEX IF EXISTS "OrganizationCredential_organizationId_idx";

-- 2. Drop the organizationId column
ALTER TABLE "OrganizationCredential" DROP COLUMN "organizationId";

-- 3. Add new columns
ALTER TABLE "OrganizationCredential" ADD COLUMN "userId" bigint;
ALTER TABLE "OrganizationCredential" ADD COLUMN "livemode" boolean NOT NULL DEFAULT false;
ALTER TABLE "OrganizationCredential" ADD COLUMN "usePlatformCredential" boolean NOT NULL DEFAULT false;
ALTER TABLE "OrganizationCredential" ADD COLUMN "isVerified" boolean NOT NULL DEFAULT false;
ALTER TABLE "OrganizationCredential" ADD COLUMN "verifiedAt" timestamp(6) with time zone;
ALTER TABLE "OrganizationCredential" ADD COLUMN "lastUsedAt" timestamp(6) with time zone;

-- 4. FK: userId → User.id
ALTER TABLE "OrganizationCredential" ADD CONSTRAINT "PlatformCredential_userId_User_id_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Rename table
ALTER TABLE "OrganizationCredential" RENAME TO "PlatformCredential";

-- 6. Partial unique indexes
CREATE UNIQUE INDEX "PlatformCredential_user_type_livemode_key"
  ON "PlatformCredential" ("userId", "type", "livemode")
  WHERE "userId" IS NOT NULL;

CREATE UNIQUE INDEX "PlatformCredential_platform_type_livemode_key"
  ON "PlatformCredential" ("type", "livemode")
  WHERE "userId" IS NULL;

CREATE INDEX "PlatformCredential_userId_idx" ON "PlatformCredential" ("userId");
