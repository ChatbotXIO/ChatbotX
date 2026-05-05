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
import { inventoryPolicyTypes } from "../partials/product"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const inventoryPolicy = pgEnum(
  "inventoryPolicy",
  inventoryPolicyTypes.options as [string, ...string[]],
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
    category: text(),
    subcategory: text(),
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
  ],
)
