import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { productModel } from "./product"

export const productVariantModel = pgTable(
  "ProductVariant",
  {
    ...sharedColumns,
    productId: bigintAsString()
      .notNull()
      .references(() => productModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    combination: jsonb().$type<Record<string, string>>().notNull(),
    price: doublePrecision().default(0).notNull(),
    isEnabled: boolean().default(true).notNull(),
    /** The variant's own SKU; null falls back to the product's. */
    sku: text(),
    /**
     * Stock of this variant alone. Null keeps stock on the product; set for
     * Shopify variants, which Shopify stocks one by one.
     */
    inventoryQuantity: integer(),
    /** Shopify's variant GID, for a Shopify product's variant. */
    externalId: text(),
    /** Shopify's inventory item GID, which inventory webhooks name. */
    externalInventoryItemId: text(),
  },
  (table) => [
    index("ProductVariant_productId_idx").using(
      "btree",
      table.productId.asc().nullsLast(),
    ),
    index("ProductVariant_externalInventoryItemId_idx")
      .on(table.externalInventoryItemId)
      .where(sql`${table.externalInventoryItemId} IS NOT NULL`),
  ],
)
