import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
} from "drizzle-orm/pg-core"
import {
  type InventoryPolicyType,
  inventoryPolicyTypes,
} from "../partials/product"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { productCategoryModel } from "./product-category"
import { workspaceModel } from "./workspace"

export const inventoryPolicy = pgEnum(
  "inventoryPolicy",
  inventoryPolicyTypes.options as [
    InventoryPolicyType,
    ...InventoryPolicyType[],
  ],
)

export const productModel = pgTable(
  "Product",
  {
    ...sharedColumns,
    name: text().notNull(),
    shortDescription: text(),
    longDescription: text(),
    price: doublePrecision().default(0).notNull(),
    taxes: doublePrecision().default(0).notNull(),
    discount: doublePrecision().default(0).notNull(),
    /** ISO 4217 code. Priced per product, not per workspace. */
    currency: text().default("USD").notNull(),
    /** Storefront link sent to Meta Catalog. Falls back to the catalog store URL. */
    productUrl: text(),
    sku: text(),
    inventoryPolicy: inventoryPolicy().default("dont_track").notNull(),
    inventoryQuantity: integer().default(0).notNull(),
    allowOutOfStockPurchase: boolean().default(false).notNull(),
    images: jsonb()
      .$type<Array<{ url: string; type: "link" | "file" }>>()
      .default([])
      .notNull(),
    tags: jsonb().$type<string[]>().default([]).notNull(),
    vendor: text(),
    rank: integer().default(10).notNull(),
    categoryId: bigintAsString().references(() => productCategoryModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /**
     * A child of `categoryId`. Kept as its own column rather than folding the
     * leaf into `categoryId` so that filtering by a top-level category still
     * finds the products filed under its children.
     */
    subcategoryId: bigintAsString().references(() => productCategoryModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    isActive: boolean().default(true).notNull(),
    isSearchable: boolean().default(true).notNull(),
    allowSpecialRequest: boolean().default(false).notNull(),
    isAddonOnly: boolean().default(false).notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("Product_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    // Both category columns are matched with an `OR` whenever products are
    // counted or filtered by category, and Postgres can only serve that from a
    // BitmapOr — which needs an index on *each* branch, not just one. They also
    // keep `ON DELETE SET NULL` from scanning the whole table when a category
    // goes away, since Postgres does not index foreign keys on its own.
    index("Product_categoryId_idx").on(table.categoryId),
    index("Product_subcategoryId_idx").on(table.subcategoryId),
  ],
)
