-- The sub-category was free text too. One insert covers both shapes: a product
-- that already has a category gets its name as a child of that category, and a
-- product without one gets a top-level row, because `parentId` here is simply
-- the category the product is filed under — null included.
INSERT INTO "ProductCategory" ("id", "workspaceId", "parentId", "name")
SELECT
  (SELECT COALESCE(MAX("id"), 0) FROM "ProductCategory")
    + row_number() OVER (
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
ON CONFLICT ("workspaceId", "parentId", "name") DO NOTHING;--> statement-breakpoint
UPDATE "Product" p
SET "subcategoryId" = c."id"
FROM "ProductCategory" c
WHERE p."subcategoryId" IS NULL
  AND p."categoryId" IS NOT NULL
  AND c."workspaceId" = p."workspaceId"
  AND c."parentId" = p."categoryId"
  AND c."name" = btrim(p."subcategory");--> statement-breakpoint
-- A name with no category above it has no parent to hang from, so it stands in
-- as the product's category rather than being thrown away.
UPDATE "Product" p
SET "categoryId" = c."id"
FROM "ProductCategory" c
WHERE p."categoryId" IS NULL
  AND c."workspaceId" = p."workspaceId"
  AND c."parentId" IS NULL
  AND c."name" = btrim(p."subcategory");--> statement-breakpoint
ALTER TABLE "Product" DROP COLUMN "subcategory";
