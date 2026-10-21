import type {
  EcommerceSettings,
  OrderShippingAddress,
  OrderStatus,
} from "@chatbotx.io/database/partials"
import { formatMoney } from "@chatbotx.io/utils/money"

/**
 * The texts the bot sends a customer about their order, as the spec shows
 * them: a confirmation when it is placed, and a note each time its status
 * changes. English, or Vietnamese for a Vietnamese contact.
 */
const STRINGS = {
  en: {
    thanks: (name: string) =>
      `${name}, thank you for placing your order 😀\nI will send you notifications about the status of your order.`,
    name: "Name",
    email: "Email",
    phone: "Phone",
    address: "Address",
    pickup: "Pickup in the store",
    date: "Date",
    payment: "Payment",
    cod: "Cash on delivery",
    total: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    coupon: (code: string) => `Coupon (${code})`,
    delivery: "Delivery",
    otherFees: "Other fees",
    items: "Items",
    numberOfItems: "Number of items",
    checkOut: "CHECK OUT",
    skippedItems: (count: number) =>
      count === 1
        ? "1 item is not sold in this store and was left out."
        : `${count} items are not sold in this store and were left out.`,
    statusUpdated: "The status of your order has been updated.",
    status: "Status",
    statuses: {
      pending: "Not processed",
      accepted: "Processing",
      shipped: "Shipped",
      concluded: "Completed",
      cancelled: "Cancelled",
    },
  },
  vi: {
    thanks: (name: string) =>
      `${name}, cảm ơn bạn đã đặt hàng 😀\nMình sẽ báo bạn mỗi khi đơn hàng đổi trạng thái.`,
    name: "Tên",
    email: "Email",
    phone: "Điện thoại",
    address: "Địa chỉ",
    pickup: "Nhận tại cửa hàng",
    date: "Ngày",
    payment: "Thanh toán",
    cod: "Thanh toán khi nhận hàng",
    total: "Tổng cộng",
    subtotal: "Tạm tính",
    discount: "Giảm giá",
    coupon: (code: string) => `Mã giảm giá (${code})`,
    delivery: "Phí giao hàng",
    otherFees: "Phí khác",
    items: "Sản phẩm",
    numberOfItems: "Số món",
    checkOut: "ĐẶT HÀNG",
    skippedItems: (count: number) =>
      `${count} món không bán ở cửa hàng này nên đã được bỏ ra.`,
    statusUpdated: "Trạng thái đơn hàng của bạn đã được cập nhật.",
    status: "Trạng thái",
    statuses: {
      pending: "Chưa xử lý",
      accepted: "Đang xử lý",
      shipped: "Đang giao",
      concluded: "Hoàn thành",
      cancelled: "Đã hủy",
    },
  },
} as const

export type CustomerMessageLanguage = keyof typeof STRINGS

export const customerMessageLanguage = (
  language: string | null | undefined,
): CustomerMessageLanguage => (language === "vi" ? "vi" : "en")

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
  createdAt: Date
  items: Array<{ name: string; variantLabel: string | null; quantity: number }>
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
  const formatted = new Intl.DateTimeFormat(
    context.language === "vi" ? "vi-VN" : "en-GB",
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
    `${strings.payment}: ${strings.cod}`,
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
  input: { status: OrderStatus; message?: string | null },
  context: Pick<MessageContext, "language">,
): string => {
  const strings = STRINGS[context.language]
  return [
    strings.statusUpdated,
    "",
    `${strings.status}: ${strings.statuses[input.status]}`,
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
