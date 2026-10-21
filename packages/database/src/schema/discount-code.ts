import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type DiscountAppliesTo,
  type DiscountCustomerFilter,
  type DiscountEligibility,
  type DiscountMinimumType,
  type DiscountType,
  discountAppliesTo,
  discountEligibilities,
  discountMinimumTypes,
  discountTypes,
} from "../partials/ecommerce"
import {
  bigintAsString,
  money,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { productCategoryModel } from "./product-category"
import { workspaceModel } from "./workspace"

export const discountType = pgEnum(
  "discountType",
  discountTypes.options as [DiscountType, ...DiscountType[]],
)
export const discountAppliesToType = pgEnum(
  "discountAppliesTo",
  discountAppliesTo.options as [DiscountAppliesTo, ...DiscountAppliesTo[]],
)
export const discountMinimumType = pgEnum(
  "discountMinimumType",
  discountMinimumTypes.options as [
    DiscountMinimumType,
    ...DiscountMinimumType[],
  ],
)
export const discountEligibility = pgEnum(
  "discountEligibility",
  discountEligibilities.options as [
    DiscountEligibility,
    ...DiscountEligibility[],
  ],
)

/**
 * A discount code ("Coupons" in the UI). Not the older `Coupon` table, which
 * is a pool of codes handed out to contacts and takes nothing off an order.
 * `productIds` has no database default — every write sets it.
 */
export const discountCodeModel = pgTable(
  "DiscountCode",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** What the customer types; matched without regard to case. */
    code: text().notNull(),
    /** Applied to carts without the customer typing it. */
    autoApply: boolean().default(false).notNull(),
    discountType: discountType().notNull(),
    /** Percent (0–100) or an amount in the store currency; 0 for free shipping. */
    discountValue: money().default(0).notNull(),
    appliesTo: discountAppliesToType().default("entireOrder").notNull(),
    /** With `appliesTo: category` — its sub-categories count too. */
    categoryId: bigintAsString().references(() => productCategoryModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** With `appliesTo: products`. */
    productIds: jsonb().$type<string[]>().notNull(),
    minimumType: discountMinimumType().default("none").notNull(),
    /** An amount or a number of items, per `minimumType`. */
    minimumValue: money().default(0).notNull(),
    /** Null is no limit. */
    usageLimit: integer(),
    usedCount: integer().default(0).notNull(),
    oncePerCustomer: boolean().default(false).notNull(),
    eligibility: discountEligibility().default("everyone").notNull(),
    /** With `eligibility: specificCustomers`. */
    customerFilter: jsonb().$type<DiscountCustomerFilter>(),
    startsAt: timestamp(timestampConfig).defaultNow().notNull(),
    /** Null never ends. */
    endsAt: timestamp(timestampConfig),
    isActive: boolean().default(true).notNull(),
  },
  (table) => [
    // Case-insensitive, so "code20" finds "CODE20" and a second "Code20"
    // cannot be created.
    uniqueIndex("DiscountCode_workspaceId_code_key").on(
      table.workspaceId,
      sql`lower(${table.code})`,
    ),
    index("DiscountCode_categoryId_idx").on(table.categoryId),
    check(
      "DiscountCode_usedCount_check",
      sql`${table.usedCount} >= 0 AND (${table.usageLimit} IS NULL OR ${table.usedCount} <= ${table.usageLimit})`,
    ),
  ],
)
