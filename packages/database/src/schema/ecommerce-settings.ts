import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type CheckoutMode,
  type CurrencyPosition,
  checkoutModes,
  currencyPositions,
  type PaymentMethod,
  type ProductButtonType,
  type ProductImageSize,
  productImageSizes,
  type ShippingMode,
  shippingModes,
  type WebshopProductView,
  webshopProductViews,
} from "../partials/ecommerce"
import { bigintAsString, money, sharedColumns } from "../partials/shared"
import { ecommerceOpenHoursModel } from "./ecommerce-open-hours"
import { flowModel } from "./flow"
import { workspaceModel } from "./workspace"

export const webshopProductView = pgEnum(
  "webshopProductView",
  webshopProductViews.options as [WebshopProductView, ...WebshopProductView[]],
)
export const productImageSize = pgEnum(
  "productImageSize",
  productImageSizes.options as [ProductImageSize, ...ProductImageSize[]],
)
export const currencyPosition = pgEnum(
  "currencyPosition",
  currencyPositions.options as [CurrencyPosition, ...CurrencyPosition[]],
)
export const shippingMode = pgEnum(
  "shippingMode",
  shippingModes.options as [ShippingMode, ...ShippingMode[]],
)
export const checkoutMode = pgEnum(
  "checkoutMode",
  checkoutModes.options as [CheckoutMode, ...CheckoutMode[]],
)

/**
 * One row per workspace, written on the first save. Until then
 * `ecommerceSettingsService.get` answers with `ECOMMERCE_SETTINGS_DEFAULTS`.
 * The jsonb columns carry no database default on purpose: the repository
 * always writes every column, so none is ever omitted on insert.
 */
export const ecommerceSettingsModel = pgTable(
  "EcommerceSettings",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    // General
    orderingAvailable: boolean().notNull(),
    webshopProductView: webshopProductView().notNull(),
    /** Null is always open. */
    openHoursId: bigintAsString().references(() => ecommerceOpenHoursModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    searchProducts: boolean().notNull(),
    facebookPixelId: text(),
    /** Null disables the abandoned-cart message. */
    abandonedCartDelayMinutes: integer(),
    /** Run for the customer when their cart is abandoned; null only emits the event. */
    abandonedCartFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    productButtons: jsonb().$type<ProductButtonType[]>().notNull(),
    productImageSize: productImageSize().notNull(),
    allowRateOrders: boolean().notNull(),
    notifyOnCartStatusChange: boolean().notNull(),

    // Payments
    paymentMethods: jsonb().$type<PaymentMethod[]>().notNull(),
    /** ISO 4217. Every order is charged in this currency. */
    currency: text().notNull(),
    currencyPosition: currencyPosition().notNull(),
    currencySymbol: text(),
    serviceFeePercent: money().notNull(),

    // Shipping
    shippingType: shippingMode().notNull(),
    storeAddress: text(),
    /** ISO 3166 alpha-2 codes. */
    shippingCountries: jsonb().$type<string[]>().notNull(),
    defaultShippingCountry: text(),
    deliveryCost: money().notNull(),

    // Checkout
    checkoutMode: checkoutMode().notNull(),
    checkoutLink: text(),
    checkoutFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    minimumOrderValue: money().notNull(),
    requireName: boolean().notNull(),
    requireEmail: boolean().notNull(),
    requirePhone: boolean().notNull(),
    requireState: boolean().notNull(),
    requireZip: boolean().notNull(),
  },
  (table) => [
    uniqueIndex("EcommerceSettings_workspaceId_key").on(table.workspaceId),
    index("EcommerceSettings_openHoursId_idx").on(table.openHoursId),
    index("EcommerceSettings_abandonedCartFlowId_idx").on(
      table.abandonedCartFlowId,
    ),
    index("EcommerceSettings_checkoutFlowId_idx").on(table.checkoutFlowId),
    check(
      "EcommerceSettings_serviceFeePercent_check",
      sql`${table.serviceFeePercent} >= 0 AND ${table.serviceFeePercent} <= 100`,
    ),
  ],
)

/**
 * The last order number handed out per workspace. Its own table, not a column
 * on the settings row, so allocating a number (a row lock held until the order
 * commits) never waits behind a settings save, and the other way round.
 */
export const ecommerceOrderCounterModel = pgTable("EcommerceOrderCounter", {
  workspaceId: bigintAsString()
    .primaryKey()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  lastNumber: bigint({ mode: "number" }).default(0).notNull(),
})
