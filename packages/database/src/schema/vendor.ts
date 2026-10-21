import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, money, sharedColumns } from "../partials/shared"
import { ecommerceOpenHoursModel } from "./ecommerce-open-hours"
import { productCategoryModel } from "./product-category"
import { workspaceModel } from "./workspace"

/** The seller or brand behind a product. */
export const vendorModel = pgTable(
  "Vendor",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    shortDescription: text(),
    phone: text(),
    storeAddress: text(),
    imageUrl: text(),
    /** Off hides the vendor's products from customers and refuses orders. */
    isActive: boolean().default(true).notNull(),
    /** 0–100, taken off every product of the vendor on top of its own. */
    discountPercent: money().default(0).notNull(),
    /** Smallest subtotal of this vendor's lines an order may carry. */
    minimumOrderValue: money().default(0).notNull(),
    /** Null is always open. */
    openHoursId: bigintAsString().references(() => ecommerceOpenHoursModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    categoryId: bigintAsString().references(() => productCategoryModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    subcategoryId: bigintAsString().references(() => productCategoryModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    rank: integer().default(10).notNull(),
  },
  (table) => [
    index("Vendor_workspaceId_idx").on(table.workspaceId),
    index("Vendor_openHoursId_idx").on(table.openHoursId),
    index("Vendor_categoryId_idx").on(table.categoryId),
    index("Vendor_subcategoryId_idx").on(table.subcategoryId),
    check(
      "Vendor_discountPercent_check",
      sql`${table.discountPercent} >= 0 AND ${table.discountPercent} <= 100`,
    ),
    // Case-insensitive, so an import naming "acme" lands on an existing "Acme"
    // instead of creating a second vendor.
    uniqueIndex("Vendor_workspaceId_name_key").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
  ],
)
