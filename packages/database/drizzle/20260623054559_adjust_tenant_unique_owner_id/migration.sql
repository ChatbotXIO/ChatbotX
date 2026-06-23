DROP INDEX "Tenant_slug_key";--> statement-breakpoint
ALTER TABLE "Tenant" DROP COLUMN "slug";--> statement-breakpoint
DROP INDEX "Tenant_ownerId_key";--> statement-breakpoint
CREATE UNIQUE INDEX "Tenant_ownerId_key" ON "Tenant" ("ownerId");