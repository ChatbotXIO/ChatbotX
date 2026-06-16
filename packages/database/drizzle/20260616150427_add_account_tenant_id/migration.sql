-- White-label isolation for social accounts: key `Account` by tenant so a single
-- provider identity (providerId + accountId) links to a SEPARATE account row per
-- tenant. Without this, an OAuth sign-in on a reseller domain resolves the owner's
-- root-tenant account (the account identity lookup is not tenant-scoped).
--
-- Forward, data-safe migration. The column is added with the root-tenant default
-- so existing rows stay valid, then backfilled from the owning user's tenant so
-- each account inherits its user's tenant before the FK is enforced.
ALTER TABLE "Account" ADD COLUMN "tenantId" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Backfill: an account belongs to the tenant of the user it is linked to.
UPDATE "Account" a SET "tenantId" = u."tenantId" FROM "User" u WHERE u."id" = a."userId";--> statement-breakpoint
CREATE INDEX "Account_providerId_accountId_tenantId_idx" ON "Account" ("providerId","accountId","tenantId");--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
