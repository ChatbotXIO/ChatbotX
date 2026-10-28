import z from "zod"

export const orderStatuses = z.enum([
  "pending",
  "accepted",
  "shipped",
  "concluded",
  "cancelled",
])
export type OrderStatus = z.infer<typeof orderStatuses>

/**
 * Where an order came from. `webshop` is our own checkout page (also where a
 * WhatsApp cart is checked out); `api` is a public API or MCP caller;
 * `manual` is a member typing one in.
 */
export const orderSources = z.enum(["webshop", "api", "manual"])
export type OrderSource = z.infer<typeof orderSources>

/**
 * `cod` is cash on delivery; `stripe` and `paypal` are paid online on the
 * provider's own page, with the store's own connected account.
 */
export const paymentMethods = z.enum(["cod", "stripe", "paypal"])
export type PaymentMethod = z.infer<typeof paymentMethods>

/** The payment methods paid online, each through its own provider. */
export const onlinePaymentProviders = z.enum(["stripe", "paypal"])
export type OnlinePaymentProvider = z.infer<typeof onlinePaymentProviders>

export const isOnlinePaymentMethod = (
  method: PaymentMethod,
): method is OnlinePaymentProvider =>
  (onlinePaymentProviders.options as readonly string[]).includes(method)

/** An online order whose money has not come in yet. */
export const isAwaitingOnlinePayment = (order: {
  paymentMethod: PaymentMethod
  paymentStatus: string
}) =>
  isOnlinePaymentMethod(order.paymentMethod) && order.paymentStatus === "unpaid"

/** How long an online order waits for its payment before it is cancelled. */
export const PAYMENT_EXPIRY_MINUTES = 30

/**
 * The cancel reason the expiry scan stores. Kept in English for the public
 * API; the builder shows it translated (`orders.paymentExpiredCancelReason`).
 */
export const PAYMENT_EXPIRED_CANCEL_REASON = "Payment not received in time."

export const paymentStatuses = z.enum(["unpaid", "paid", "refunded"])
export type PaymentStatus = z.infer<typeof paymentStatuses>

/**
 * One attempt to pay an order online: `open` while the provider's page can
 * still take the money, `paid` once it did, `expired` when it can no longer,
 * `refunded` once the money went back.
 */
export const orderPaymentStatuses = z.enum([
  "open",
  "paid",
  "expired",
  "refunded",
])
export type OrderPaymentStatus = z.infer<typeof orderPaymentStatuses>

/** How one order reaches the customer. */
export const shippingTypes = z.enum(["delivery", "pickup"])
export type ShippingType = z.infer<typeof shippingTypes>

/**
 * What the store offers at checkout: nothing to ship (`none`), delivery,
 * pickup, or the customer chooses between the two.
 */
export const shippingModes = z.enum([
  "none",
  "delivery",
  "pickup",
  "deliveryAndPickup",
])
export type ShippingMode = z.infer<typeof shippingModes>

/** Shipping types an order may use under a store shipping mode. */
export const SHIPPING_TYPES_BY_MODE = {
  none: [],
  delivery: ["delivery"],
  pickup: ["pickup"],
  deliveryAndPickup: ["delivery", "pickup"],
} as const satisfies Record<ShippingMode, readonly ShippingType[]>

/** Where the money symbol goes, and whether a space separates it. */
export const currencyPositions = z.enum([
  "left",
  "leftSpace",
  "right",
  "rightSpace",
])
export type CurrencyPosition = z.infer<typeof currencyPositions>

/**
 * `default` is our own checkout page, `externalLink` sends the customer to the
 * merchant's URL, `flow` starts a flow for the contact, `productPage` sends the
 * customer to the product's own `productUrl`.
 */
export const checkoutModes = z.enum([
  "default",
  "externalLink",
  "flow",
  "productPage",
])
export type CheckoutMode = z.infer<typeof checkoutModes>

/**
 * What the customer gets when their order is placed: the built-in message
 * (in the workspace language), a flow of the store's own, or nothing.
 */
export const orderConfirmationModes = z.enum(["default", "flow", "none"])
export type OrderConfirmationMode = z.infer<typeof orderConfirmationModes>

export const webshopProductViews = z.enum([
  "list",
  "listWithoutImage",
  "card",
  "cardSquare",
  "image",
  "imageSquare",
])
export type WebshopProductView = z.infer<typeof webshopProductViews>

export const productImageSizes = z.enum(["bigSquare", "mediumRectangle"])
export type ProductImageSize = z.infer<typeof productImageSizes>

export const productButtonTypes = z.enum([
  "addToCart",
  "share",
  "similar",
  "save",
])
export type ProductButtonType = z.infer<typeof productButtonTypes>

/**
 * The button sets the settings page offers, in its order. Stored as the list
 * of buttons, always in `productButtonTypes` order, so a set has one spelling.
 */
export const PRODUCT_BUTTON_SETS: readonly (readonly ProductButtonType[])[] = [
  ["addToCart"],
  ["addToCart", "share"],
  ["addToCart", "share", "similar"],
  ["addToCart", "share", "save"],
  ["addToCart", "similar"],
  ["addToCart", "similar", "save"],
  ["addToCart", "save"],
  ["share"],
  ["similar"],
  ["save"],
  ["share", "similar"],
  ["share", "save"],
  ["similar", "save"],
  ["share", "similar", "save"],
]

/** Minutes to wait before an abandoned-cart message; the settings choices. */
export const ABANDONED_CART_DELAY_MINUTES = [
  5, 10, 15, 30, 45, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 720, 840,
  1080, 1200, 1440,
] as const

/** Who moved an order to a status — shown on the order's timeline. */
export const orderActorTypes = z.enum(["user", "apiToken", "system", "contact"])
export type OrderActorType = z.infer<typeof orderActorTypes>

/**
 * The only moves an order can make. The service, the API and the buttons on
 * the order page all read this one map, so they can never disagree about what
 * is allowed. `concluded` and `cancelled` are final.
 */
export const ORDER_STATUS_TRANSITIONS = {
  pending: ["accepted", "cancelled"],
  accepted: ["shipped", "concluded", "cancelled"],
  shipped: ["concluded", "cancelled"],
  concluded: [],
  cancelled: [],
} as const satisfies Record<OrderStatus, readonly OrderStatus[]>

/** The statuses an order may be in for a move to `to` to be allowed. */
export const getOrderStatusesAllowedBefore = (to: OrderStatus): OrderStatus[] =>
  orderStatuses.options.filter((from) =>
    (ORDER_STATUS_TRANSITIONS[from] as readonly OrderStatus[]).includes(to),
  )

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * One window the store takes orders in, in the workspace timezone. `day` is
 * 0 (Sunday) to 6. `to` before `from` runs past midnight into the next day.
 */
export const openHoursRangeSchema = z
  .object({
    day: z.number().int().min(0).max(6).describe("0 = Sunday … 6 = Saturday."),
    from: z
      .string()
      .regex(TIME_OF_DAY_PATTERN)
      .describe("Opening time, `HH:mm`, workspace timezone."),
    to: z
      .string()
      .regex(TIME_OF_DAY_PATTERN)
      .describe(
        "Closing time, `HH:mm`. Earlier than `from` runs past midnight.",
      ),
  })
  .refine((range) => range.from !== range.to, {
    message: "Opening and closing time must differ.",
  })
export type OpenHoursRange = z.infer<typeof openHoursRangeSchema>

export const openHoursSchema = z.array(openHoursRangeSchema).max(7 * 4)

/** A named schedule the store and each vendor can pick. */
export const openHoursScheduleSchema = z.object({
  name: z.string().trim().min(1).max(255).describe("Schedule name."),
  ranges: openHoursSchema
    .min(1)
    .describe("Windows orders are taken in, workspace timezone."),
})
export type OpenHoursSchedule = z.infer<typeof openHoursScheduleSchema>

/** A two-letter ISO 3166 country code, e.g. `VN`. */
export const shippingCountryCodeSchema = z
  .string()
  .trim()
  .length(2)
  .transform((code) => code.toUpperCase())

/** A three-letter ISO 4217 currency code, e.g. `VND`. */
export const storeCurrencyCodeSchema = z
  .string()
  .trim()
  .length(3)
  .transform((code) => code.toUpperCase())

/** One line of a cart: what was chosen, priced only when ordered. */
export const cartLineSchema = z.object({
  productId: z
    .string()
    .regex(/^\d+$/)
    .describe("Product id from `products.list`."),
  variantId: z
    .string()
    .regex(/^\d+$/)
    .nullable()
    .describe("Variant id, for a product with variants."),
  quantity: z.number().int().min(1).max(10_000),
})
export type CartLine = z.infer<typeof cartLineSchema>

export const orderShippingAddressSchema = z.object({
  line1: z.string().trim().max(500).nullish(),
  line2: z.string().trim().max(500).nullish(),
  city: z.string().trim().max(255).nullish(),
  state: z.string().trim().max(255).nullish(),
  zip: z.string().trim().max(32).nullish(),
  country: z.string().trim().max(2).nullish(),
})
export type OrderShippingAddress = z.infer<typeof orderShippingAddressSchema>

/**
 * Store settings, grouped the way the settings page shows them. The table
 * stores them flat; `ecommerceSettingsService` converts between the two.
 */
export const ecommerceGeneralSettingsSchema = z.object({
  orderingAvailable: z
    .boolean()
    .describe("Whether customers can place orders at all."),
  webshopProductView: webshopProductViews.describe(
    "How the web shop lists products.",
  ),
  openHoursId: z
    .string()
    .regex(/^\d+$/)
    .nullable()
    .describe(
      "Open-hours schedule orders are taken in (Pro); null is always open. Get it from `openHours.list`.",
    ),
  searchProducts: z
    .boolean()
    .describe("Let customers search products by message (Pro)."),
  facebookPixelId: z
    .string()
    .trim()
    .max(64)
    .nullable()
    .describe("Facebook Pixel id loaded on the web shop (Pro)."),
  abandonedCartDelayMinutes: z
    .number()
    .int()
    .refine((minutes) =>
      (ABANDONED_CART_DELAY_MINUTES as readonly number[]).includes(minutes),
    )
    .nullable()
    .describe(
      `Minutes after the customer leaves a cart before the reminder (Pro); null disables it. One of ${ABANDONED_CART_DELAY_MINUTES.join(", ")}.`,
    ),
  abandonedCartFlowId: z
    .string()
    .regex(/^\d+$/)
    .nullable()
    .describe(
      "Flow run for the customer when their cart is abandoned; null only emits the `cartAbandoned` trigger event. Get it from `flows.list`.",
    ),
  productButtons: z
    .array(productButtonTypes)
    .min(1)
    .max(productButtonTypes.options.length)
    .transform((buttons) =>
      productButtonTypes.options.filter((button) => buttons.includes(button)),
    )
    .describe("Buttons shown on each product inside the bot."),
  productImageSize: productImageSizes.describe("Product image size."),
  allowRateOrders: z
    .boolean()
    .describe("Let customers rate a completed order."),
  notifyOnCartStatusChange: z
    .boolean()
    .describe("Message the customer when their order changes status."),
})
export type EcommerceGeneralSettings = z.infer<
  typeof ecommerceGeneralSettingsSchema
>

export const ecommercePaymentSettingsSchema = z.object({
  paymentMethods: z
    .array(paymentMethods)
    .min(1)
    .describe(
      "Payment methods offered at checkout: `cod` (cash on delivery), `stripe` (card) and `paypal`. Stripe and PayPal must be connected first (`paymentProviders.list`); PayPal only takes some currencies (not VND).",
    ),
  currency: storeCurrencyCodeSchema.describe(
    "ISO 4217 code every order is charged in, e.g. `VND`.",
  ),
  currencyPosition: currencyPositions.describe(
    "Whether the symbol goes before or after the amount.",
  ),
  currencySymbol: z
    .string()
    .trim()
    .max(8)
    .nullable()
    .describe("Symbol shown with prices, e.g. `₫`. Null shows the code."),
  serviceFeePercent: z
    .number()
    .min(0)
    .max(100)
    .describe("Percentage of the subtotal added to every order, 0–100."),
})
export type EcommercePaymentSettings = z.infer<
  typeof ecommercePaymentSettingsSchema
>

export const ecommerceShippingSettingsSchema = z.object({
  shippingType: shippingModes.describe(
    "`none`, `delivery` to the customer, `pickup` in the store, or `deliveryAndPickup` (the customer picks).",
  ),
  storeAddress: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .describe("Where pickup orders are collected."),
  shippingCountries: z
    .array(shippingCountryCodeSchema)
    .max(300)
    .describe("ISO 3166 country codes the store delivers to."),
  defaultShippingCountry: shippingCountryCodeSchema
    .nullable()
    .describe("Country pre-selected at checkout; must be in the list."),
  deliveryCost: z
    .number()
    .min(0)
    .describe("Flat delivery fee added to delivery orders."),
})
export type EcommerceShippingSettings = z.infer<
  typeof ecommerceShippingSettingsSchema
>

export const ecommerceCheckoutSettingsSchema = z.object({
  checkoutMode: checkoutModes.describe(
    "`default` our checkout page, `externalLink` a custom external checkout page, `flow` start a flow, `productPage` visit the product's external page (`productUrl`).",
  ),
  checkoutLink: z
    .string()
    .trim()
    .max(2048)
    .pipe(z.url({ protocol: /^https?$/ }))
    .nullable()
    .describe("Checkout URL, required when `checkoutMode` is `externalLink`."),
  checkoutFlowId: z
    .string()
    .regex(/^\d+$/)
    .nullable()
    .describe(
      "Flow to start, required when `checkoutMode` is `flow`. Get it from `flows.list`.",
    ),
  minimumOrderValue: z
    .number()
    .min(0)
    .describe("Smallest subtotal that can be ordered; 0 for none."),
  orderConfirmationMode: orderConfirmationModes.describe(
    "What the customer gets when their order is placed: `default` the built-in confirmation (order details, in the workspace language), `flow` run `orderConfirmationFlowId` instead, `none` nothing. The `newOrder` trigger event fires either way.",
  ),
  orderConfirmationFlowId: z
    .string()
    .regex(/^\d+$/)
    .nullable()
    .describe(
      "Flow run in the customer's conversation when their order is placed, required when `orderConfirmationMode` is `flow`. Get it from `flows.list`.",
    ),
  requireName: z.boolean().describe("Buyer name is required."),
  requireEmail: z.boolean().describe("Email is required."),
  requirePhone: z.boolean().describe("Phone number is required."),
  requireState: z.boolean().describe("State / province is required."),
  requireZip: z.boolean().describe("ZIP code is required."),
})
export type EcommerceCheckoutSettings = z.infer<
  typeof ecommerceCheckoutSettingsSchema
>

export const ecommerceSettingsSchema = z.object({
  general: ecommerceGeneralSettingsSchema,
  payments: ecommercePaymentSettingsSchema,
  shipping: ecommerceShippingSettingsSchema,
  checkout: ecommerceCheckoutSettingsSchema,
})
export type EcommerceSettings = z.infer<typeof ecommerceSettingsSchema>

/** What a workspace that never opened its settings gets. */
export const ECOMMERCE_SETTINGS_DEFAULTS: EcommerceSettings = {
  general: {
    orderingAvailable: true,
    webshopProductView: "list",
    openHoursId: null,
    searchProducts: false,
    facebookPixelId: null,
    abandonedCartDelayMinutes: null,
    abandonedCartFlowId: null,
    productButtons: ["addToCart", "share", "similar"],
    productImageSize: "bigSquare",
    allowRateOrders: false,
    notifyOnCartStatusChange: true,
  },
  payments: {
    paymentMethods: ["cod"],
    currency: "USD",
    currencyPosition: "left",
    currencySymbol: "$",
    serviceFeePercent: 0,
  },
  shipping: {
    shippingType: "delivery",
    storeAddress: null,
    shippingCountries: [],
    defaultShippingCountry: null,
    deliveryCost: 0,
  },
  checkout: {
    checkoutMode: "default",
    checkoutLink: null,
    checkoutFlowId: null,
    minimumOrderValue: 0,
    orderConfirmationMode: "default",
    orderConfirmationFlowId: null,
    requireName: true,
    requireEmail: false,
    requirePhone: true,
    requireState: false,
    requireZip: false,
  },
}

/** Settings marked "Pro" in the product spec. */
export const ecommerceProFeatures = z.enum([
  "openHours",
  "searchProducts",
  "facebookPixel",
  "abandonedCart",
])
export type EcommerceProFeature = z.infer<typeof ecommerceProFeatures>

// ─── Discount codes ("Coupons") ─────────────────────────────────────────────

/** `freeShipping` takes the delivery cost off and has no value. */
export const discountTypes = z.enum([
  "percentage",
  "fixedAmount",
  "freeShipping",
])
export type DiscountType = z.infer<typeof discountTypes>

/** What part of the order the code takes money off. */
export const discountAppliesTo = z.enum(["entireOrder", "category", "products"])
export type DiscountAppliesTo = z.infer<typeof discountAppliesTo>

export const discountMinimumTypes = z.enum(["none", "amount", "quantity"])
export type DiscountMinimumType = z.infer<typeof discountMinimumTypes>

/** `specificCustomers` is the contacts matching `customerFilter`. */
export const discountEligibilities = z.enum(["everyone", "specificCustomers"])
export type DiscountEligibility = z.infer<typeof discountEligibilities>

/**
 * The contact filter a code is limited to — the same shape the contacts list
 * and broadcasts store; its conditions are validated where it is written.
 */
export type DiscountCustomerFilter = {
  operator: "and" | "or"
  conditions: unknown[]
  timezone?: string
}
