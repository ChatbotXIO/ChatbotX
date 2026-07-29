CREATE UNIQUE INDEX "Import_products_active_idx" ON "Import" ("workspaceId") WHERE "type" = 'products' AND "status" IN ('pending', 'processing');--> statement-breakpoint
-- The category was free text until this release. Give every name still in use a
-- real row and point the product at it before the column goes, so an existing
-- install does not come back with its whole catalogue uncategorised.
-- Ids continue above the highest one already handed out, which keeps them clear
-- of both the stored rows and every id the application will generate later.
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
ON CONFLICT ("workspaceId", "name") DO NOTHING;--> statement-breakpoint
UPDATE "Product" p
SET "categoryId" = c."id"
FROM "ProductCategory" c
WHERE p."categoryId" IS NULL
  AND c."workspaceId" = p."workspaceId"
  AND c."name" = btrim(p."category");--> statement-breakpoint
ALTER TABLE "Product" DROP COLUMN "category";
