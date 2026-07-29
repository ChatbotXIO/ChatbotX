-- Everything the products screen, the category tree and the Meta catalog
-- connection need. Each statement looks at the current state before it changes
-- anything, so the migration lands the same way on a fresh database and on one
-- that already has part of this feature, and running it twice is not an error.

CREATE TABLE IF NOT EXISTS "ProductCategory" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"parentId" bigint,
	"name" text NOT NULL,
	"rank" integer DEFAULT 10 NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "IntegrationMetaCatalog" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"catalogId" text,
	"catalogName" text,
	"businessId" text,
	"encryptedAuth" jsonb NOT NULL,
	"authMode" "metaCatalogAuthMode" DEFAULT 'oauth'::"metaCatalogAuthMode" NOT NULL,
	"tokenExpiresAt" timestamp(6) with time zone,
	"status" "metaCatalogConnectionStatus" DEFAULT 'active'::"metaCatalogConnectionStatus" NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	"storeUrl" text,
	"importStatus" "metaCatalogImportStatus" DEFAULT 'idle'::"metaCatalogImportStatus" NOT NULL,
	"importTotalCount" integer DEFAULT 0 NOT NULL,
	"importedCount" integer DEFAULT 0 NOT NULL,
	"importFailedCount" integer DEFAULT 0 NOT NULL,
	"importError" text,
	"lastImportedAt" timestamp(6) with time zone
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MetaCatalogItem" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"integrationMetaCatalogId" bigint NOT NULL,
	"catalogId" text NOT NULL,
	"productId" bigint NOT NULL,
	"retailerId" text NOT NULL,
	"direction" "metaCatalogItemDirection" DEFAULT 'push'::"metaCatalogItemDirection" NOT NULL,
	"lastSyncedFingerprint" text,
	"lastSyncedAt" timestamp(6) with time zone
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MetaCatalogSyncRun" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationMetaCatalogId" bigint NOT NULL,
	"catalogId" text,
	"status" "metaCatalogSyncStatus" DEFAULT 'queued'::"metaCatalogSyncStatus" NOT NULL,
	"direction" "metaCatalogItemDirection" DEFAULT 'push'::"metaCatalogItemDirection" NOT NULL,
	"scope" "metaCatalogSyncScope" DEFAULT 'all'::"metaCatalogSyncScope" NOT NULL,
	"categoryId" bigint,
	"selectedProductIds" jsonb DEFAULT '[]' NOT NULL,
	"handles" jsonb DEFAULT '[]' NOT NULL,
	"totalCount" integer DEFAULT 0 NOT NULL,
	"succeededCount" integer DEFAULT 0 NOT NULL,
	"failedCount" integer DEFAULT 0 NOT NULL,
	"skippedCount" integer DEFAULT 0 NOT NULL,
	"itemErrors" jsonb DEFAULT '[]' NOT NULL,
	"skippedItems" jsonb DEFAULT '[]' NOT NULL,
	"pollAttempt" integer DEFAULT 0 NOT NULL,
	"error" text,
	"startedAt" timestamp(6) with time zone,
	"finishedAt" timestamp(6) with time zone
);--> statement-breakpoint
-- Columns on tables that already existed, and on the tables above when they
-- were created by an earlier draft of this feature.
ALTER TABLE "Import" ADD COLUMN IF NOT EXISTS "errorSample" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "categoryId" bigint;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" bigint;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "productUrl" text;--> statement-breakpoint
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "parentId" bigint;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN IF NOT EXISTS "importStatus" "metaCatalogImportStatus" DEFAULT 'idle'::"metaCatalogImportStatus" NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN IF NOT EXISTS "importTotalCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN IF NOT EXISTS "importedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN IF NOT EXISTS "importFailedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN IF NOT EXISTS "importError" text;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD COLUMN IF NOT EXISTS "lastImportedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "MetaCatalogSyncRun" ADD COLUMN IF NOT EXISTS "direction" "metaCatalogItemDirection" DEFAULT 'push'::"metaCatalogItemDirection" NOT NULL;--> statement-breakpoint
ALTER TABLE "MetaCatalogSyncRun" ADD COLUMN IF NOT EXISTS "catalogId" text;--> statement-breakpoint
-- A link row records which catalog it belongs to. On a table that predates the
-- column the value comes from the connection, and a link whose connection has
-- no catalog can no longer be matched against Meta, so it goes.
DO $catalog_id$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"MetaCatalogItem"'::regclass
      AND attname = 'catalogId'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "MetaCatalogItem" ADD COLUMN "catalogId" text;
    EXECUTE $sql$
      UPDATE "MetaCatalogItem" AS "item"
      SET "catalogId" = "connection"."catalogId"
      FROM "IntegrationMetaCatalog" AS "connection"
      WHERE "connection"."id" = "item"."integrationMetaCatalogId"
        AND "connection"."catalogId" IS NOT NULL
    $sql$;
    EXECUTE 'DELETE FROM "MetaCatalogItem" WHERE "catalogId" IS NULL';
    ALTER TABLE "MetaCatalogItem" ALTER COLUMN "catalogId" SET NOT NULL;
  END IF;
END
$catalog_id$;--> statement-breakpoint
-- Links created by an import are never given a fingerprint or a sync timestamp,
-- which is what separates them from pushed rows on an existing table.
DO $direction$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"MetaCatalogItem"'::regclass
      AND attname = 'direction'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "MetaCatalogItem"
      ADD COLUMN "direction" "metaCatalogItemDirection"
      DEFAULT 'push'::"metaCatalogItemDirection" NOT NULL;
    EXECUTE $sql$
      UPDATE "MetaCatalogItem"
      SET "direction" = 'import'::"metaCatalogItemDirection"
      WHERE "lastSyncedAt" IS NULL
    $sql$;
  END IF;
END
$direction$;--> statement-breakpoint
-- The name of a category is unique per parent now, so the workspace-wide index
-- it replaces goes first: the backfills below file the same name under more
-- than one parent, which the old index would reject.
DROP INDEX IF EXISTS "ProductCategory_workspaceId_name_key";--> statement-breakpoint
-- Constraints, added only where they are missing so a partly migrated database
-- ends up with the same set as a fresh one.
DO $constraints$
DECLARE
  wanted record;
BEGIN
  FOR wanted IN
    SELECT *
    FROM (VALUES
      ('ProductCategory', 'ProductCategory_workspaceId_Workspace_id_fkey', 'FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('ProductCategory', 'ProductCategory_parentId_ProductCategory_id_fkey', 'FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('ProductCategory', 'ProductCategory_workspaceId_parent_name_key', 'UNIQUE NULLS NOT DISTINCT ("workspaceId", "parentId", "name")'),
      ('Product', 'Product_categoryId_ProductCategory_id_fkey', 'FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
      ('Product', 'Product_subcategoryId_ProductCategory_id_fkey', 'FOREIGN KEY ("subcategoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
      ('IntegrationMetaCatalog', 'IntegrationMetaCatalog_workspaceId_Workspace_id_fkey', 'FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('IntegrationMetaCatalog', 'IntegrationMetaCatalog_integrationId_Integration_id_fkey', 'FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('MetaCatalogItem', 'MetaCatalogItem_wJXyKUssR08y_fkey', 'FOREIGN KEY ("integrationMetaCatalogId") REFERENCES "IntegrationMetaCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('MetaCatalogItem', 'MetaCatalogItem_productId_Product_id_fkey', 'FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('MetaCatalogSyncRun', 'MetaCatalogSyncRun_workspaceId_Workspace_id_fkey', 'FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('MetaCatalogSyncRun', 'MetaCatalogSyncRun_8PnmCJ0uISUd_fkey', 'FOREIGN KEY ("integrationMetaCatalogId") REFERENCES "IntegrationMetaCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('MetaCatalogSyncRun', 'MetaCatalogSyncRun_categoryId_ProductCategory_id_fkey', 'FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE')
    ) AS t(table_name, constraint_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = wanted.constraint_name
        AND conrelid = format('%I', wanted.table_name)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I %s',
        wanted.table_name,
        wanted.constraint_name,
        wanted.definition
      );
    END IF;
  END LOOP;
END
$constraints$;--> statement-breakpoint
-- The category was free text until this release. Give every name still in use a
-- real row and point the product at it before the column goes, so an existing
-- install does not come back with its whole catalogue uncategorised.
-- Ids continue above the highest one already handed out, which keeps them clear
-- of both the stored rows and every id the application will generate later.
DO $category_text$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"Product"'::regclass
      AND attname = 'category'
      AND NOT attisdropped
  ) THEN
    EXECUTE $sql$
      INSERT INTO "ProductCategory" ("id", "workspaceId", "name")
      SELECT
        GREATEST(
          (SELECT COALESCE(MAX("id"), 0) FROM "ProductCategory"),
          (SELECT COALESCE(MAX("id"), 0) FROM "Product")
        ) + row_number() OVER (ORDER BY named."workspaceId", named."name"),
        named."workspaceId",
        named."name"
      FROM (
        SELECT DISTINCT p."workspaceId", btrim(p."category") AS "name"
        FROM "Product" p
        WHERE btrim(COALESCE(p."category", '')) <> ''
      ) named
      ON CONFLICT ("workspaceId", "parentId", "name") DO NOTHING
    $sql$;
    EXECUTE $sql$
      UPDATE "Product" p
      SET "categoryId" = c."id"
      FROM "ProductCategory" c
      WHERE p."categoryId" IS NULL
        AND c."parentId" IS NULL
        AND c."workspaceId" = p."workspaceId"
        AND c."name" = btrim(p."category")
    $sql$;
    ALTER TABLE "Product" DROP COLUMN "category";
  END IF;
END
$category_text$;--> statement-breakpoint
-- The sub-category was free text too. One insert covers both shapes: a product
-- that already has a category gets its name as a child of that category, and a
-- product without one gets a top-level row, because `parentId` here is simply
-- the category the product is filed under — null included.
DO $subcategory_text$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"Product"'::regclass
      AND attname = 'subcategory'
      AND NOT attisdropped
  ) THEN
    EXECUTE $sql$
      INSERT INTO "ProductCategory" ("id", "workspaceId", "parentId", "name")
      SELECT
        GREATEST(
          (SELECT COALESCE(MAX("id"), 0) FROM "ProductCategory"),
          (SELECT COALESCE(MAX("id"), 0) FROM "Product")
        ) + row_number() OVER (
          ORDER BY named."workspaceId", named."parentId" NULLS FIRST, named."name"
        ),
        named."workspaceId",
        named."parentId",
        named."name"
      FROM (
        SELECT DISTINCT
          p."workspaceId",
          p."categoryId" AS "parentId",
          btrim(p."subcategory") AS "name"
        FROM "Product" p
        WHERE btrim(COALESCE(p."subcategory", '')) <> ''
      ) named
      ON CONFLICT ("workspaceId", "parentId", "name") DO NOTHING
    $sql$;
    EXECUTE $sql$
      UPDATE "Product" p
      SET "subcategoryId" = c."id"
      FROM "ProductCategory" c
      WHERE p."subcategoryId" IS NULL
        AND p."categoryId" IS NOT NULL
        AND c."workspaceId" = p."workspaceId"
        AND c."parentId" = p."categoryId"
        AND c."name" = btrim(p."subcategory")
    $sql$;
    -- A name with no category above it has no parent to hang from, so it stands
    -- in as the product's category rather than being thrown away.
    EXECUTE $sql$
      UPDATE "Product" p
      SET "categoryId" = c."id"
      FROM "ProductCategory" c
      WHERE p."categoryId" IS NULL
        AND c."workspaceId" = p."workspaceId"
        AND c."parentId" IS NULL
        AND c."name" = btrim(p."subcategory")
    $sql$;
    ALTER TABLE "Product" DROP COLUMN "subcategory";
  END IF;
END
$subcategory_text$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProductCategory_workspaceId_idx" ON "ProductCategory" ("workspaceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProductCategory_parentId_idx" ON "ProductCategory" ("parentId");--> statement-breakpoint
-- A product reaches its category through either column, so both are indexed:
-- filtering by a parent has to find everything filed under its children too.
CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product" ("categoryId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Product_subcategoryId_idx" ON "Product" ("subcategoryId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationMetaCatalog_workspaceId_key" ON "IntegrationMetaCatalog" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationMetaCatalog_integrationId_key" ON "IntegrationMetaCatalog" ("integrationId");--> statement-breakpoint
-- Both link indexes gained the catalog column, so an earlier draft's version of
-- them is rebuilt rather than kept.
DROP INDEX IF EXISTS "MetaCatalogItem_integration_retailer_key";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "MetaCatalogItem_integration_retailer_key" ON "MetaCatalogItem" ("integrationMetaCatalogId","catalogId","retailerId");--> statement-breakpoint
DROP INDEX IF EXISTS "MetaCatalogItem_integration_product_key";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "MetaCatalogItem_integration_product_key" ON "MetaCatalogItem" ("integrationMetaCatalogId","catalogId","productId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MetaCatalogItem_productId_idx" ON "MetaCatalogItem" ("productId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "MetaCatalogSyncRun_active_idx" ON "MetaCatalogSyncRun" ("workspaceId") WHERE "status" IN ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Import_products_active_idx" ON "Import" ("workspaceId") WHERE "type" = 'products' AND "status" IN ('pending', 'processing');
