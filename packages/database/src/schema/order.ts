import { sql } from "drizzle-orm"
import {
  bigint,
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
  type OrderActorType,
  type OrderShippingAddress,
  type OrderSource,
  type OrderStatus,
  orderActorTypes,
  orderSources,
  orderStatuses,
  type PaymentMethod,
  type PaymentStatus,
  paymentMethods,
  paymentStatuses,
  type ShippingType,
  shippingTypes,
} from "../partials/ecommerce"
import {
  bigintAsString,
  money,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { conversationModel } from "./conversation"
import { discountCodeModel } from "./discount-code"
import { inboxModel } from "./inbox"
import { productModel } from "./product"
import { productCategoryModel } from "./product-category"
import { productVariantModel } from "./product-variant"
import { vendorModel } from "./vendor"
import { workspaceModel } from "./workspace"

export const orderStatus = pgEnum(
  "orderStatus",
  orderStatuses.options as [OrderStatus, ...OrderStatus[]],
)
export const orderSource = pgEnum(
  "orderSource",
  orderSources.options as [OrderSource, ...OrderSource[]],
)
export const paymentMethod = pgEnum(
  "paymentMethod",
  paymentMethods.options as [PaymentMethod, ...PaymentMethod[]],
)
export const paymentStatus = pgEnum(
  "paymentStatus",
  paymentStatuses.options as [PaymentStatus, ...PaymentStatus[]],
)
export const shippingType = pgEnum(
  "shippingType",
  shippingTypes.options as [ShippingType, ...ShippingType[]],
)
export const orderActorType = pgEnum(
  "orderActorType",
  orderActorTypes.options as [OrderActorType, ...OrderActorType[]],
)

export const orderModel = pgTable(
  "Order",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** 1, 2, 3… per workspace, from `EcommerceOrderCounter`. */
    number: bigint({ mode: "number" }).notNull(),
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    inboxId: bigintAsString().references(() => inboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    conversationId: bigintAsString().references(() => conversationModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    channel: text(),
    source: orderSource().notNull(),
    status: orderStatus().default("pending").notNull(),
    paymentMethod: paymentMethod().default("cod").notNull(),
    paymentStatus: paymentStatus().default("unpaid").notNull(),
    /**
     * When an online order still unpaid is cancelled. Null for cash on
     * delivery.
     */
    paymentExpiresAt: timestamp(timestampConfig),
    paidAt: timestamp(timestampConfig),
    /** ISO 4217, copied from the store settings (or the cart) when placed. */
    currency: text().notNull(),
    subtotal: money().notNull(),
    discountTotal: money().notNull(),
    shippingTotal: money().notNull(),
    serviceFeeTotal: money().notNull(),
    taxTotal: money().notNull(),
    /** Taken off by the discount code, after the line discounts. */
    couponDiscount: money().default(0).notNull(),
    total: money().notNull(),
    discountCodeId: bigintAsString().references(() => discountCodeModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** The code as the customer used it, kept when the code is deleted. */
    discountCode: text(),
    customerName: text(),
    customerEmail: text(),
    customerPhone: text(),
    shippingType: shippingType(),
    shippingAddress: jsonb().$type<OrderShippingAddress>(),
    note: text(),
    /** 1–5, set when the customer rates the order. */
    rating: integer(),
    ratingComment: text(),
    acceptedAt: timestamp(timestampConfig),
    shippedAt: timestamp(timestampConfig),
    concludedAt: timestamp(timestampConfig),
    cancelledAt: timestamp(timestampConfig),
    cancelReason: text(),
  },
  (table) => [
    uniqueIndex("Order_workspaceId_number_key").on(
      table.workspaceId,
      table.number,
    ),
    index("Order_workspaceId_createdAt_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
    ),
    index("Order_workspaceId_status_idx").on(table.workspaceId, table.status),
    index("Order_contactId_idx").on(table.contactId),
    // `ON DELETE SET NULL` on these would otherwise scan the whole table.
    index("Order_contactInboxId_idx").on(table.contactInboxId),
    index("Order_inboxId_idx").on(table.inboxId),
    index("Order_conversationId_idx").on(table.conversationId),
    index("Order_discountCodeId_idx").on(table.discountCodeId),
    // The scan that cancels online orders whose payment never came.
    index("Order_paymentExpiresAt_idx")
      .on(table.paymentExpiresAt)
      .where(
        sql`${table.status} = 'pending' AND ${table.paymentStatus} = 'unpaid' AND ${table.paymentExpiresAt} IS NOT NULL`,
      ),
  ],
)

/**
 * A line of an order, copied from the product when the order was placed. The
 * order page reads these columns, never the product, so editing or deleting a
 * product never rewrites an order that was already taken.
 */
export const orderItemModel = pgTable(
  "OrderItem",
  {
    ...sharedColumns,
    orderId: bigintAsString()
      .notNull()
      .references(() => orderModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    productId: bigintAsString().references(() => productModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    variantId: bigintAsString().references(() => productVariantModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    vendorId: bigintAsString().references(() => vendorModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    categoryId: bigintAsString().references(() => productCategoryModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    name: text().notNull(),
    /** `Red / XL` — the variant's option values, joined for display. */
    variantLabel: text(),
    combination: jsonb().$type<Record<string, string>>(),
    sku: text(),
    /** Meta's id for the item, kept for a WhatsApp cart line. */
    retailerId: text(),
    imageUrl: text(),
    vendorName: text(),
    unitPrice: money().notNull(),
    quantity: integer().notNull(),
    /**
     * Units actually taken from the product's stock when the order was placed
     * (less than `quantity` when stock ran out or the product was untracked).
     * Cancelling or deleting gives back exactly this, whatever the product's
     * inventory policy is by then.
     */
    stockTaken: integer().notNull().default(0),
    discountPercent: money().notNull(),
    taxPercent: money().notNull(),
    discountTotal: money().notNull(),
    taxTotal: money().notNull(),
    lineTotal: money().notNull(),
  },
  (table) => [
    index("OrderItem_orderId_idx").on(table.orderId),
    index("OrderItem_workspaceId_productId_idx").on(
      table.workspaceId,
      table.productId,
    ),
    index("OrderItem_workspaceId_vendorId_idx").on(
      table.workspaceId,
      table.vendorId,
    ),
    index("OrderItem_variantId_idx").on(table.variantId),
    index("OrderItem_categoryId_idx").on(table.categoryId),
  ],
)

/** Every status an order went through, for the timeline on the order page. */
export const orderStatusHistoryModel = pgTable(
  "OrderStatusHistory",
  {
    ...sharedColumns,
    orderId: bigintAsString()
      .notNull()
      .references(() => orderModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Null for the row written when the order was placed. */
    fromStatus: orderStatus(),
    toStatus: orderStatus().notNull(),
    actorType: orderActorType().notNull(),
    actorUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    note: text(),
  },
  (table) => [
    index("OrderStatusHistory_orderId_createdAt_idx").on(
      table.orderId,
      table.createdAt,
    ),
    index("OrderStatusHistory_workspaceId_idx").on(table.workspaceId),
    index("OrderStatusHistory_actorUserId_idx").on(table.actorUserId),
  ],
)

/**
 * One use of a discount code: an order carries at most one. Counted for
 * "one use per customer" and removed (with `usedCount` given back) when the
 * order is cancelled or deleted.
 */
export const discountCodeRedemptionModel = pgTable(
  "DiscountCodeRedemption",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    discountCodeId: bigintAsString()
      .notNull()
      .references(() => discountCodeModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    orderId: bigintAsString()
      .notNull()
      .references(() => orderModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    amount: money().notNull(),
  },
  (table) => [
    uniqueIndex("DiscountCodeRedemption_orderId_key").on(table.orderId),
    index("DiscountCodeRedemption_discountCodeId_contactId_idx").on(
      table.discountCodeId,
      table.contactId,
    ),
    index("DiscountCodeRedemption_contactId_idx").on(table.contactId),
  ],
)
