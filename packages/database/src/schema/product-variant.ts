import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
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
  },
  (table) => [
    index("ProductVariant_productId_idx").using(
      "btree",
      table.productId.asc().nullsLast(),
    ),
  ],
)
