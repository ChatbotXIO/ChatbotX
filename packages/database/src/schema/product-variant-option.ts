import { index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { productModel } from "./product"

export const productVariantOptionModel = pgTable(
  "ProductVariantOption",
  {
    ...sharedColumns,
    productId: bigintAsString()
      .notNull()
      .references(() => productModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    values: jsonb().$type<string[]>().default([]).notNull(),
    position: integer().default(10).notNull(),
  },
  (table) => [
    index("ProductVariantOption_productId_idx").using(
      "btree",
      table.productId.asc().nullsLast(),
    ),
  ],
)
