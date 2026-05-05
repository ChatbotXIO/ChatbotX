import { index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { productModel } from "./product"

export const productAddonModel = pgTable(
  "ProductAddon",
  {
    ...sharedColumns,
    productId: bigintAsString()
      .notNull()
      .references(() => productModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull().default(""),
    maxSelections: integer().notNull().default(1),
    addonProductIds: jsonb().$type<string[]>().default([]).notNull(),
  },
  (table) => [
    index("ProductAddon_productId_idx").using(
      "btree",
      table.productId.asc().nullsLast(),
    ),
  ],
)
