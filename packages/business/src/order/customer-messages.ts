import type {
  EcommerceSettings,
  OrderShippingAddress,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@chatbotx.io/database/partials"
import { formatMoney } from "@chatbotx.io/utils/money"
import {
  CUSTOMER_MESSAGE_LANGUAGES,
  CUSTOMER_MESSAGE_STRINGS,
  type CustomerMessageLanguage,
} from "./customer-message-strings"

/**
 * The texts the bot sends a customer about their order, as the spec shows
 * them: a confirmation when it is placed, and a note each time its status
 * changes — in the workspace language (`customer-message-strings.ts`).
 */
const STRINGS = CUSTOMER_MESSAGE_STRINGS

export type { CustomerMessageLanguage } from "./customer-message-strings"

const isCustomerMessageLanguage = (
  language: string,
): language is CustomerMessageLanguage =>
  (CUSTOMER_MESSAGE_LANGUAGES as readonly string[]).includes(language)

/** A workspace language the messages are not written in reads as English. */
export const customerMessageLanguage = (
  language: string | null | undefined,
): CustomerMessageLanguage =>
  language && isCustomerMessageLanguage(language) ? language : "en"

/** Every store text in one language, e.g. a collection card's buttons. */
export const customerMessageStrings = (language: CustomerMessageLanguage) =>
  STRINGS[language]

export type CustomerOrderSummary = {
  number: number
  status: OrderStatus
  currency: string
  subtotal: number
  discountTotal: number
  shippingTotal: number
  serviceFeeTotal: number
  taxTotal: number
  couponDiscount: number
  discountCode: string | null
  total: number
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  shippingType: "delivery" | "pickup" | null
  shippingAddress: OrderShippingAddress | null
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  createdAt: Date
  items: Array<{ name: string; variantLabel: string | null; quantity: number }>
}

/** How the customer pays, as the store's messages name it. */
export const paymentMethodLabel = (
  method: PaymentMethod,
  language: CustomerMessageLanguage,
): string => {
  const strings = STRINGS[language]
  switch (method) {
    case "stripe":
      return strings.card
    case "paypal":
      return "PayPal"
    default:
      return strings.cod
  }
}

/** "Card (Paid)" once an online payment came in; the method alone otherwise. */
const paymentLine = (
  order: Pick<CustomerOrderSummary, "paymentMethod" | "paymentStatus">,
  language: CustomerMessageLanguage,
) => {
  const label = paymentMethodLabel(order.paymentMethod, language)
  return order.paymentStatus === "paid"
    ? `${label} (${STRINGS[language].paid})`
    : label
}

type MessageContext = {
  language: CustomerMessageLanguage
  payments: EcommerceSettings["payments"]
  storeAddress: string | null
  timeZone: string
}

const money = (
  amount: number,
  order: { currency: string },
  context: Pick<MessageContext, "payments">,
) => {
  const isStoreCurrency =
    order.currency.toUpperCase() === context.payments.currency
  return formatMoney(amount, {
    currency: order.currency,
    symbol: isStoreCurrency ? context.payments.currencySymbol : null,
    position: isStoreCurrency ? context.payments.currencyPosition : "left",
  })
}

const formatAddress = (
  order: CustomerOrderSummary,
  context: MessageContext,
): string => {
  const strings = STRINGS[context.language]
  if (order.shippingType === "pickup") {
    return [strings.pickup, context.storeAddress].filter(Boolean).join(": ")
  }
  const address = order.shippingAddress
  return [
    address?.country,
    address?.state,
    address?.city,
    address?.line1,
    address?.line2,
  ]
    .filter(Boolean)
    .join(", ")
}

const formatDate = (date: Date, context: MessageContext): string => {
  // English reads day-first, as the spec shows ("21 April 26 09:48").
  const formatted = new Intl.DateTimeFormat(
    context.language === "en" ? "en-GB" : context.language,
    {
      timeZone: context.timeZone,
      day: "numeric",
      month: "long",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "shortOffset",
    },
  ).format(date)
  return formatted
}

/** Sent once, when the order is placed. */
export const buildOrderConfirmationText = (
  order: CustomerOrderSummary,
  context: MessageContext,
): string => {
  const strings = STRINGS[context.language]
  const otherFees = order.serviceFeeTotal + order.taxTotal
  const lines = [
    strings.thanks(order.customerName ?? ""),
    "",
    `--- #${order.number} ---`,
    "",
    `${strings.name}: ${order.customerName ?? ""}`,
    `${strings.email}: ${order.customerEmail ?? ""}`,
    `${strings.phone}: ${order.customerPhone ?? ""}`,
    "",
    `${strings.address}: ${formatAddress(order, context)}`,
    "",
    `${strings.date}: ${formatDate(order.createdAt, context)}`,
    "",
    `${strings.payment}: ${paymentLine(order, context.language)}`,
    "",
    `${strings.total}: ${money(order.total, order, context)}`,
    `${strings.subtotal}: ${money(order.subtotal, order, context)}`,
    ...(order.discountTotal > 0
      ? [`${strings.discount}: ${money(-order.discountTotal, order, context)}`]
      : []),
    `${strings.delivery}: ${money(order.shippingTotal, order, context)}`,
    ...(otherFees > 0
      ? [`${strings.otherFees}: ${money(otherFees, order, context)}`]
      : []),
    ...(order.couponDiscount > 0
      ? [
          `${strings.coupon(order.discountCode ?? "")}: ${money(-order.couponDiscount, order, context)}`,
        ]
      : []),
    "",
    `${strings.items}:`,
    ...order.items.map(
      (item) =>
        `${item.quantity} X ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ""}`,
    ),
  ]
  return lines.join("\n")
}

/**
 * Sent when the status changes. A message the member typed in the status
 * dialog rides along in the same text.
 */
export const buildOrderStatusText = (
  input: {
    status: OrderStatus
    message?: string | null
    /** The online payment went back to the customer with this move. */
    refunded?: boolean
    /** The order was cancelled because its online payment never came. */
    paymentExpired?: boolean
  },
  context: Pick<MessageContext, "language">,
): string => {
  const strings = STRINGS[context.language]
  return [
    strings.statusUpdated,
    "",
    `${strings.status}: ${strings.statuses[input.status]}`,
    ...(input.paymentExpired ? ["", strings.paymentExpired] : []),
    ...(input.refunded ? ["", strings.refunded] : []),
    ...(input.message ? ["", input.message] : []),
  ].join("\n")
}

export type CartSummary = {
  itemCount: number
  currency: string
  subtotal: number
  discountTotal: number
  shippingTotal: number
  serviceFeeTotal: number
  taxTotal: number
  total: number
  /** The code applied to the cart and what it takes off. */
  discount: { code: string; amount: number } | null
  /** Items the customer sent that this store does not sell. */
  skipped: number
}

/**
 * The bot's reply to a cart sent from a chat catalog, above its CHECK OUT
 * button: what is in it and what it costs.
 */
export const buildCartSummaryText = (
  cart: CartSummary,
  context: Pick<MessageContext, "language" | "payments">,
): string => {
  const strings = STRINGS[context.language]
  const otherFees = cart.serviceFeeTotal + cart.taxTotal
  return [
    `${strings.numberOfItems}: ${cart.itemCount}`,
    `${strings.subtotal}: ${money(cart.subtotal, cart, context)}`,
    ...(cart.discountTotal > 0
      ? [`${strings.discount}: ${money(-cart.discountTotal, cart, context)}`]
      : []),
    `${strings.delivery}: ${money(cart.shippingTotal, cart, context)}`,
    `${strings.otherFees}: ${money(otherFees, cart, context)}`,
    ...(cart.discount
      ? [
          `${strings.coupon(cart.discount.code)}: ${money(-cart.discount.amount, cart, context)}`,
        ]
      : []),
    `${strings.total}: ${money(cart.total, cart, context)}`,
    ...(cart.skipped > 0 ? ["", strings.skippedItems(cart.skipped)] : []),
  ].join("\n")
}

export const checkoutButtonLabel = (language: CustomerMessageLanguage) =>
  STRINGS[language].checkOut
