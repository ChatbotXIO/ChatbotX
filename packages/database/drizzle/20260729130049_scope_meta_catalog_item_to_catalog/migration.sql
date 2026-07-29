CREATE TYPE "metaCatalogItemDirection" AS ENUM('push', 'import');--> statement-breakpoint
ALTER TABLE "MetaCatalogItem" ADD COLUMN "direction" "metaCatalogItemDirection" DEFAULT 'push'::"metaCatalogItemDirection" NOT NULL;--> statement-breakpoint
-- Links created by an import are never given a fingerprint or a sync timestamp,
-- which is what separates them from pushed rows on an existing table.
UPDATE "MetaCatalogItem" SET "direction" = 'import'::"metaCatalogItemDirection" WHERE "lastSyncedAt" IS NULL;--> statement-breakpoint
-- Added nullable first: the column is NOT NULL in the final shape, and an
-- existing table has no value to hand it until the backfill below runs.
ALTER TABLE "MetaCatalogItem" ADD COLUMN "catalogId" text;--> statement-breakpoint
UPDATE "MetaCatalogItem" AS "item"
SET "catalogId" = "connection"."catalogId"
FROM "IntegrationMetaCatalog" AS "connection"
WHERE "connection"."id" = "item"."integrationMetaCatalogId"
  AND "connection"."catalogId" IS NOT NULL;--> statement-breakpoint
-- A link whose connection has no catalog cannot name the catalog it lives in,
-- so it can no longer be matched against Meta and is dropped rather than
-- blocking the NOT NULL below.
DELETE FROM "MetaCatalogItem" WHERE "catalogId" IS NULL;--> statement-breakpoint
ALTER TABLE "MetaCatalogItem" ALTER COLUMN "catalogId" SET NOT NULL;--> statement-breakpoint
DROP INDEX "MetaCatalogItem_integration_retailer_key";--> statement-breakpoint
CREATE UNIQUE INDEX "MetaCatalogItem_integration_retailer_key" ON "MetaCatalogItem" ("integrationMetaCatalogId","catalogId","retailerId");--> statement-breakpoint
DROP INDEX "MetaCatalogItem_integration_product_key";--> statement-breakpoint
CREATE UNIQUE INDEX "MetaCatalogItem_integration_product_key" ON "MetaCatalogItem" ("integrationMetaCatalogId","catalogId","productId");
