import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type EcommerceSettings,
  getOrderStatusesAllowedBefore,
  type OrderActorType,
  type OrderShippingAddress,
  type OrderSource,
  type OrderStatus,
  SHIPPING_TYPES_BY_MODE,
  type ShippingType,
} from "@chatbotx.io/database/partials"
import {
  ecommerceSettingsRepository,
  type OrderItemInsertValues,
  type OrderListInput,
  type OrderUpdateValues,
  orderRepository,
  productRepository,
} from "@chatbotx.io/database/repositories"
import type { OrderModel } from "@chatbotx.io/database/types"
import {
  emitOrderStatus,
  emitProductOrdered,
  type OrderEventMetadata,
  type OrderStatusEventType,
} from "@chatbotx.io/events"
import { computeLinePrice, percentOf, sumMoney } from "@chatbotx.io/utils/money"
import {
  getNewOrderNotificationJobId,
  NotificationJobAction,
  notificationQueue,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { conversationService } from "../conversation/service"
import type { CouponLine } from "../discount-code/pricing"
import {
  type AppliedDiscount,
  discountCodeService,
} from "../discount-code/service"
import { ecommerceSettingsService } from "../ecommerce-settings/service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { messageService } from "../message/service"
import { workspaceService } from "../workspace/service"
import { resolveContactMessageLanguage } from "./contact-language"
import {
  buildOrderConfirmationText,
  buildOrderStatusText,
} from "./customer-messages"
import {
  orderBelowMinimumException,
  orderBelowVendorMinimumException,
  orderEmptyException,
  orderInvalidStatusTransitionException,
  orderingUnavailableException,
  orderOutOfStockException,
  orderProductUnavailableException,
  orderShippingTypeUnavailableException,
} from "./errors"

/** Who placed or moved an order, for its timeline. */
export type OrderActor = {
  type: OrderActorType
  userId?: string | null
}

/** The conversation an order belongs to, when it has one. */
export type OrderContactRef = {
  contactId?: string | null
  contactInboxId?: string | null
  inboxId?: string | null
  conversationId?: string | null
  channel?: string | null
}

export type PlaceOrderItem = {
  productId: string
  /** Required for a product with variants, forbidden for one without. */
  variantId?: string | null
  quantity: number
}

export type PlaceOrderInput = {
  workspaceId: string
  source: OrderSource
  actor: OrderActor
  contact?: OrderContactRef
  items: PlaceOrderItem[]
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  /**
   * Delivery or pickup. Must be one the store offers; when the store offers
   * only one, it is used and this may be left out.
   */
  shippingType?: ShippingType | null
  shippingAddress?: OrderShippingAddress | null
  note?: string | null
  /** A code the customer typed; an unusable one refuses the order. */
  discountCode?: string | null
  /**
   * Without a typed code, apply the automatic code that takes off the most
   * (the web shop does; an API order only gets the code it names).
   */
  autoApplyDiscount?: boolean
  /**
   * Runs inside the order's transaction once the order is written — the web
   * shop empties the cart here, so a failed order never loses it.
   */
  onPlaced?: (order: OrderModel, tx: DatabaseClient) => Promise<void>
}

type ProductForOrder = Awaited<
  ReturnType<typeof productRepository.findForOrder>
>[number]

type PricedLine = OrderItemInsertValues & {
  gross: number
  /** Stock is taken from this product. */
  stockProductId: string
}

type OrderTotals = Pick<
  OrderModel,
  | "subtotal"
  | "discountTotal"
  | "shippingTotal"
  | "serviceFeeTotal"
  | "taxTotal"
  | "couponDiscount"
  | "total"
>

const STATUS_TIMESTAMP_COLUMNS = {
  accepted: "acceptedAt",
  shipped: "shippedAt",
  concluded: "concludedAt",
  cancelled: "cancelledAt",
} as const satisfies Partial<Record<OrderStatus, keyof OrderUpdateValues>>

/** The trigger event of the status an order moved to. */
const ORDER_STATUS_EVENTS: Record<OrderStatus, OrderStatusEventType> = {
  pending: "newOrder",
  accepted: "orderAccepted",
  shipped: "orderShipped",
  concluded: "orderConcluded",
  cancelled: "orderCancelled",
}

/** An order in one of these still holds the stock it took. */
const STOCK_HOLDING_STATUSES: readonly OrderStatus[] = [
  "pending",
  "accepted",
  "shipped",
]

const variantLabel = (combination: Record<string, string>): string =>
  Object.values(combination).join(" / ")

/**
 * The product's own discount and its vendor's, stacked: 10% then 20% is 28%
 * off, never more than 100%.
 */
const stackDiscounts = (productPercent: number, vendorPercent: number) =>
  100 - ((100 - productPercent) * (100 - vendorPercent)) / 100

/** Same product and variant on two lines become one line. */
const mergeItems = (items: PlaceOrderItem[]): PlaceOrderItem[] => {
  const merged = new Map<string, PlaceOrderItem>()
  for (const item of items) {
    const key = `${item.productId}\u0000${item.variantId ?? ""}`
    const existing = merged.get(key)
    merged.set(key, {
      ...item,
      quantity: (existing?.quantity ?? 0) + item.quantity,
    })
  }
  return Array.from(merged.values())
}

const assertOrderable = (product: ProductForOrder | undefined, id: string) => {
  if (!product?.isActive) {
    throw orderProductUnavailableException(`Product ${id} is not available.`)
  }
  if (product.vendor && !product.vendor.isActive) {
    throw orderProductUnavailableException(
      `The vendor of "${product.name}" is not taking orders.`,
    )
  }
  return product
}

const priceLine = (input: {
  product: ProductForOrder
  item: PlaceOrderItem
  currency: string
}): PricedLine => {
  const { product, item, currency } = input
  const enabledVariants = product.variants.filter(
    (variant) => variant.isEnabled,
  )
  const variant = item.variantId
    ? product.variants.find((candidate) => candidate.id === item.variantId)
    : undefined

  if (item.variantId && !variant?.isEnabled) {
    throw orderProductUnavailableException(
      `The chosen variant of "${product.name}" is not available.`,
    )
  }
  if (!item.variantId && enabledVariants.length > 0) {
    throw orderProductUnavailableException(
      `Choose a variant of "${product.name}".`,
    )
  }

  const unitPrice = variant?.price ?? product.price
  const discountPercent = stackDiscounts(
    product.discount,
    product.vendor?.discountPercent ?? 0,
  )
  const line = computeLinePrice({
    unitPrice,
    quantity: item.quantity,
    discountPercent,
    taxPercent: product.taxes,
    currency,
  })
  return {
    productId: product.id,
    variantId: variant?.id ?? null,
    vendorId: product.vendorId,
    categoryId: product.categoryId,
    name: product.name,
    variantLabel: variant ? variantLabel(variant.combination) : null,
    combination: variant?.combination ?? null,
    sku: product.sku,
    retailerId: null,
    imageUrl: product.images[0]?.url ?? null,
    vendorName: product.vendor?.name ?? null,
    unitPrice,
    quantity: item.quantity,
    discountPercent,
    taxPercent: product.taxes,
    discountTotal: line.discountTotal,
    taxTotal: line.taxTotal,
    lineTotal: line.lineTotal,
    gross: line.gross,
    stockProductId: product.id,
  }
}

/** Each vendor's lines, after discounts, against that vendor's minimum. */
const assertVendorMinimums = (
  lines: PricedLine[],
  products: Map<string, ProductForOrder>,
  currency: string,
) => {
  const byVendor = new Map<string, number[]>()
  for (const line of lines) {
    if (line.vendorId) {
      byVendor.set(line.vendorId, [
        ...(byVendor.get(line.vendorId) ?? []),
        line.gross - (line.discountTotal ?? 0),
      ])
    }
  }
  for (const [vendorId, amounts] of byVendor) {
    const vendor = [...products.values()].find(
      (product) => product.vendorId === vendorId,
    )?.vendor
    const minimum = vendor?.minimumOrderValue ?? 0
    if (vendor && minimum > 0 && sumMoney(amounts, currency) < minimum) {
      throw orderBelowVendorMinimumException(vendor.name, minimum)
    }
  }
}

/** The shipping type an order gets under the store's shipping mode. */
const resolveShippingType = (
  settings: EcommerceSettings,
  requested: ShippingType | null | undefined,
): ShippingType | null => {
  const allowed: readonly ShippingType[] =
    SHIPPING_TYPES_BY_MODE[settings.shipping.shippingType]
  if (allowed.length === 0) {
    return null
  }
  if (!requested) {
    return allowed[0] ?? null
  }
  if (!allowed.includes(requested)) {
    throw orderShippingTypeUnavailableException(requested)
  }
  return requested
}

/** A line as a discount code sees it: its categories and its price after discounts. */
const toCouponLine = (
  line: PricedLine,
  products: Map<string, ProductForOrder>,
): CouponLine => {
  const product = products.get(line.stockProductId)
  return {
    productId: line.productId ?? null,
    categoryIds: [product?.categoryId, product?.subcategoryId].filter(
      (id): id is string => Boolean(id),
    ),
    amount: line.gross - (line.discountTotal ?? 0),
    quantity: line.quantity,
  }
}

/**
 * The order's money. The discount code comes off after the line discounts;
 * the service fee is taken on what is left of the goods (a free-shipping code
 * does not lower it).
 */
const computeTotals = (input: {
  lines: PricedLine[]
  currency: string
  shippingTotal: number
  serviceFeePercent: number
  coupon?: { amount: number; freeShipping: boolean } | null
}): OrderTotals => {
  const { lines, currency } = input
  const subtotal = sumMoney(
    lines.map((line) => line.gross),
    currency,
  )
  const discountTotal = sumMoney(
    lines.map((line) => line.discountTotal ?? 0),
    currency,
  )
  const taxTotal = sumMoney(
    lines.map((line) => line.taxTotal ?? 0),
    currency,
  )
  const couponDiscount = input.coupon?.amount ?? 0
  const goodsCoupon = input.coupon?.freeShipping ? 0 : couponDiscount
  const serviceFeeTotal = percentOf(
    subtotal - discountTotal - goodsCoupon,
    input.serviceFeePercent,
    currency,
  )
  return {
    subtotal,
    discountTotal,
    taxTotal,
    serviceFeeTotal,
    shippingTotal: input.shippingTotal,
    couponDiscount,
    total: sumMoney(
      [
        subtotal,
        -discountTotal,
        taxTotal,
        serviceFeeTotal,
        input.shippingTotal,
        -couponDiscount,
      ],
      currency,
    ),
  }
}

/**
 * What the goods cost after every discount — the line discounts and the
 * discount code (a free-shipping code takes nothing off the goods). The
 * store's minimum order value is checked against this, as its setting says.
 */
const goodsAfterDiscounts = (
  totals: OrderTotals,
  discount: AppliedDiscount | null,
) =>
  totals.subtotal -
  totals.discountTotal -
  (discount?.discountCode.discountType === "freeShipping"
    ? 0
    : totals.couponDiscount)

/** Stock each product loses, summed over its lines. */
const quantitiesByProduct = (
  lines: Array<{ stockProductId: string | null; quantity: number }>,
): Map<string, number> => {
  const quantities = new Map<string, number>()
  for (const line of lines) {
    if (line.stockProductId) {
      quantities.set(
        line.stockProductId,
        (quantities.get(line.stockProductId) ?? 0) + line.quantity,
      )
    }
  }
  return quantities
}

class OrderService extends BaseService {
  async list(input: OrderListInput) {
    return await orderRepository.list(input)
  }

  async getDetail(input: { workspaceId: string; orderId: string }) {
    const order = await orderRepository.findDetail(input)
    if (!order) {
      throw notFoundException("Order does not exist.")
    }
    return order
  }

  /**
   * Places an order from product ids. Prices, stock and the order number are
   * all settled in one transaction, so a failure leaves no trace: stock is not
   * taken and the number is handed out again.
   */
  async place(input: PlaceOrderInput) {
    const items = mergeItems(input.items)
    if (items.length === 0) {
      throw orderEmptyException()
    }
    const contact = await this.resolveConversation(
      input.workspaceId,
      input.contact,
    )

    const order = await db.transaction(async (tx) => {
      const {
        settings,
        currency,
        products,
        lines,
        shippingType,
        totals,
        discount,
      } = await this.priceDraft({
        workspaceId: input.workspaceId,
        items,
        shippingType: input.shippingType,
        contactId: contact?.contactId ?? null,
        discountCode: input.discountCode,
        autoApplyDiscount: input.autoApplyDiscount,
        tx,
      })
      if (input.source === "webshop" && !settings.general.orderingAvailable) {
        throw orderingUnavailableException()
      }
      if (input.source !== "manual") {
        const minimum = settings.checkout.minimumOrderValue
        if (minimum > 0 && goodsAfterDiscounts(totals, discount) < minimum) {
          throw orderBelowMinimumException(minimum)
        }
        assertVendorMinimums(lines, products, currency)
      }

      await this.takeStock({
        workspaceId: input.workspaceId,
        lines,
        products,
        tx,
      })

      const number = await ecommerceSettingsRepository.nextOrderNumber(
        input.workspaceId,
        tx,
      )
      const created = await orderRepository.insert(
        {
          workspaceId: input.workspaceId,
          number,
          contactId: contact?.contactId ?? null,
          contactInboxId: contact?.contactInboxId ?? null,
          inboxId: contact?.inboxId ?? null,
          conversationId: contact?.conversationId ?? null,
          channel: contact?.channel ?? null,
          source: input.source,
          currency,
          ...totals,
          discountCodeId: discount?.discountCode.id ?? null,
          discountCode: discount?.discountCode.code ?? null,
          customerName: input.customerName ?? null,
          customerEmail: input.customerEmail ?? null,
          customerPhone: input.customerPhone ?? null,
          shippingType,
          shippingAddress:
            shippingType === "delivery"
              ? (input.shippingAddress ?? null)
              : null,
          note: input.note ?? null,
        },
        tx,
      )
      if (!created) {
        throw new Error("Failed to create the order")
      }
      if (discount) {
        await discountCodeService.redeem(
          {
            workspaceId: input.workspaceId,
            orderId: created.id,
            contactId: created.contactId,
            applied: discount,
          },
          tx,
        )
      }
      await orderRepository.insertItems(
        {
          workspaceId: input.workspaceId,
          orderId: created.id,
          items: lines.map(
            ({ gross: _gross, stockProductId: _stock, ...line }) => line,
          ),
        },
        tx,
      )
      await orderRepository.insertHistory(
        {
          orderId: created.id,
          workspaceId: input.workspaceId,
          fromStatus: null,
          toStatus: created.status,
          actorType: input.actor.type,
          actorUserId: input.actor.userId ?? null,
          note: null,
        },
        tx,
      )
      await input.onPlaced?.(created, tx)
      return created
    })

    await this.afterStatusChange({ order, from: null })
    return await this.getDetail({
      workspaceId: input.workspaceId,
      orderId: order.id,
    })
  }

  /**
   * What the items would cost as an order right now, without taking stock or
   * writing anything — the web shop's cart and checkout show this. Items that
   * cannot be ordered (inactive, vendor off, variant gone) are left out and
   * returned in `unavailable` instead of failing the whole quote.
   */
  async quote(input: {
    workspaceId: string
    items: PlaceOrderItem[]
    shippingType?: ShippingType | null
    contactId?: string | null
    /** The code the customer typed; one that cannot be used is reported. */
    discountCode?: string | null
    autoApplyDiscount?: boolean
  }) {
    const items = mergeItems(input.items)
    const products = new Map(
      (
        await productRepository.findForOrder({
          workspaceId: input.workspaceId,
          productIds: items.map((item) => item.productId),
        })
      ).map((row) => [row.id, row]),
    )
    const orderable: PlaceOrderItem[] = []
    // Named when the product still exists, so the customer knows which one.
    const unavailable: Array<PlaceOrderItem & { name: string | null }> = []
    for (const item of items) {
      try {
        const product = assertOrderable(
          products.get(item.productId),
          item.productId,
        )
        priceLine({ product, item, currency: "USD" })
        orderable.push(item)
      } catch {
        unavailable.push({
          ...item,
          name: products.get(item.productId)?.name ?? null,
        })
      }
    }
    // A typed code that cannot be used does not fail the quote: the cart
    // shows why and is priced without it.
    let discountError: {
      code: string
      data?: Record<string, string | number>
    } | null = null
    let draft: Awaited<ReturnType<typeof this.priceDraft>>
    try {
      draft = await this.priceDraft({
        workspaceId: input.workspaceId,
        items: orderable,
        shippingType: input.shippingType,
        contactId: input.contactId ?? null,
        discountCode: input.discountCode,
        autoApplyDiscount: input.autoApplyDiscount,
      })
    } catch (error) {
      if (
        !(
          input.discountCode &&
          error instanceof ChatbotXException &&
          error.code.startsWith("discountCode")
        )
      ) {
        throw error
      }
      discountError = { code: error.code, data: error.data }
      draft = await this.priceDraft({
        workspaceId: input.workspaceId,
        items: orderable,
        shippingType: input.shippingType,
        contactId: input.contactId ?? null,
        autoApplyDiscount: input.autoApplyDiscount,
      })
    }
    const minimum = draft.settings.checkout.minimumOrderValue
    return {
      currency: draft.currency,
      shippingType: draft.shippingType,
      lines: draft.lines.map(
        ({ gross: _gross, stockProductId: _stock, ...line }) => line,
      ),
      totals: draft.totals,
      discount: draft.discount
        ? {
            code: draft.discount.discountCode.code,
            amount: draft.discount.amount,
            discountType: draft.discount.discountCode.discountType,
            automatic: !input.discountCode || discountError !== null,
          }
        : null,
      discountError,
      unavailable,
      belowMinimum:
        minimum > 0 &&
        goodsAfterDiscounts(draft.totals, draft.discount) < minimum
          ? minimum
          : null,
    }
  }

  /** Prices items with the store settings: lines, shipping and totals. */
  private async priceDraft(input: {
    workspaceId: string
    items: PlaceOrderItem[]
    shippingType?: ShippingType | null
    contactId?: string | null
    discountCode?: string | null
    autoApplyDiscount?: boolean
    /** Inside an order's transaction: the code is locked to be redeemed. */
    tx?: DatabaseClient
  }) {
    const tx = input.tx ?? db
    const settings = await ecommerceSettingsService.getFresh(
      input.workspaceId,
      tx,
    )
    const currency = settings.payments.currency
    const products = new Map(
      (
        await productRepository.findForOrder(
          {
            workspaceId: input.workspaceId,
            productIds: input.items.map((item) => item.productId),
          },
          tx,
        )
      ).map((row) => [row.id, row]),
    )
    const lines = input.items.map((item) =>
      priceLine({
        product: assertOrderable(products.get(item.productId), item.productId),
        item,
        currency,
      }),
    )
    const shippingType = resolveShippingType(settings, input.shippingType)
    const shippingTotal =
      shippingType === "delivery" ? settings.shipping.deliveryCost : 0
    const discount: AppliedDiscount | null =
      lines.length > 0
        ? await discountCodeService.resolve({
            workspaceId: input.workspaceId,
            contactId: input.contactId ?? null,
            lines: lines.map((line) => toCouponLine(line, products)),
            shippingType,
            shippingTotal,
            currency,
            code: input.discountCode,
            autoApply: input.autoApplyDiscount,
            tx: input.tx,
          })
        : null
    const totals = computeTotals({
      lines,
      currency,
      shippingTotal,
      serviceFeePercent: settings.payments.serviceFeePercent,
      coupon: discount
        ? {
            amount: discount.amount,
            freeShipping: discount.discountCode.discountType === "freeShipping",
          }
        : null,
    })
    return {
      settings,
      currency,
      products,
      lines,
      shippingType,
      totals,
      discount,
    }
  }

  /**
   * Moves an order along `ORDER_STATUS_TRANSITIONS`. The move is one guarded
   * update, so of two concurrent moves only one lands and the other gets
   * `orderInvalidStatusTransition`. Cancelling gives the stock back;
   * completing a cash-on-delivery order marks it paid. A `message` is kept on
   * the order's history and sent to the customer in the order's conversation.
   */
  async transition(input: {
    workspaceId: string
    orderId: string
    to: Exclude<OrderStatus, "pending">
    actor: OrderActor
    message?: string | null
  }) {
    const { workspaceId, orderId, to } = input
    const message = input.message?.trim() || null
    const result = await db.transaction(async (tx) => {
      // Locked, so a concurrent move or delete cannot slip in between this
      // read and the update — the history's `from` is the real one.
      const current = await orderRepository.findForUpdate(
        { workspaceId, orderId },
        tx,
      )
      if (!current) {
        throw notFoundException("Order does not exist.")
      }
      const values: OrderUpdateValues = {
        [STATUS_TIMESTAMP_COLUMNS[to]]: new Date(),
      }
      if (to === "concluded" && current.paymentMethod === "cod") {
        values.paymentStatus = "paid"
      }
      if (to === "cancelled") {
        values.cancelReason = message
      }

      const updated = await orderRepository.transitionStatus(
        {
          workspaceId,
          orderId,
          from: getOrderStatusesAllowedBefore(to),
          to,
          values,
        },
        tx,
      )
      if (!updated) {
        const latest = await orderRepository.find({ workspaceId, orderId }, tx)
        throw orderInvalidStatusTransitionException(
          latest?.status ?? current.status,
          to,
        )
      }

      if (to === "cancelled") {
        // The code before the products: the same lock order as placing an
        // order, so a cancel and a new order cannot deadlock.
        await discountCodeService.release({ workspaceId, orderId }, tx)
        await this.returnStock({ workspaceId, orderId, tx })
      }
      await orderRepository.insertHistory(
        {
          orderId,
          workspaceId,
          fromStatus: current.status,
          toStatus: to,
          actorType: input.actor.type,
          actorUserId: input.actor.userId ?? null,
          note: message,
        },
        tx,
      )
      return { order: updated, from: current.status }
    })

    await this.afterStatusChange({ ...result, message })
    return await this.getDetail({ workspaceId, orderId })
  }

  accept(input: TransitionShortcutInput) {
    return this.transition({ ...input, to: "accepted" })
  }

  ship(input: TransitionShortcutInput) {
    return this.transition({ ...input, to: "shipped" })
  }

  conclude(input: TransitionShortcutInput) {
    return this.transition({ ...input, to: "concluded" })
  }

  cancel(input: TransitionShortcutInput) {
    return this.transition({ ...input, to: "cancelled" })
  }

  /**
   * Deletes an order with its lines and history. An order that still holds
   * stock (not yet completed or cancelled) gives it back first.
   */
  async delete(input: { workspaceId: string; orderId: string }) {
    await db.transaction(async (tx) => {
      // Locked, so a concurrent cancel cannot also give the stock back.
      const current = await orderRepository.findForUpdate(input, tx)
      if (!current) {
        throw notFoundException("Order does not exist.")
      }
      // The code before the products, as when placing an order.
      await discountCodeService.release(input, tx)
      if (STOCK_HOLDING_STATUSES.includes(current.status)) {
        await this.returnStock({ ...input, tx })
      }
      await orderRepository.delete(input, tx)
    })
    await this.invalidateCacheTags(`orders:${input.workspaceId}`)
  }

  /**
   * The one place an order's side effects hang off — placed (`from` null) or
   * moved. A placed order confirms itself to the customer and pushes to the
   * members who want new orders; a move tells the customer the new status
   * when the store sends those, or always for a cancel or a completion, with
   * the member's message riding along.
   */
  private async afterStatusChange(input: {
    order: OrderModel
    from: OrderStatus | null
    message?: string | null
  }) {
    const { order } = input
    await this.invalidateCacheTags(`orders:${order.workspaceId}`)

    if (input.from === null) {
      await notificationQueue
        .add(
          NotificationJobAction.notifyNewOrder,
          {
            type: NotificationJobAction.notifyNewOrder,
            data: { workspaceId: order.workspaceId, orderId: order.id },
          },
          { jobId: getNewOrderNotificationJobId(order.id) },
        )
        .catch((err: unknown) =>
          logger.warn(
            { err, orderId: order.id },
            "[order] could not queue the new-order notification",
          ),
        )
    }

    if (!order.contactId) {
      return
    }
    await this.announceOrderEvents(order, input.from)
    try {
      const settings = await ecommerceSettingsService.get(order.workspaceId)
      const language = await resolveContactMessageLanguage(order)
      if (input.from === null) {
        const [detail, workspace] = await Promise.all([
          this.getDetail({ workspaceId: order.workspaceId, orderId: order.id }),
          workspaceService.findById({ id: order.workspaceId }),
        ])
        await this.messageCustomer(
          order,
          buildOrderConfirmationText(detail, {
            language,
            payments: settings.payments,
            storeAddress: settings.shipping.storeAddress,
            timeZone: workspace.timezone,
          }),
        )
        return
      }
      const alwaysNotified =
        order.status === "cancelled" || order.status === "concluded"
      if (
        settings.general.notifyOnCartStatusChange ||
        alwaysNotified ||
        input.message
      ) {
        await this.messageCustomer(
          order,
          buildOrderStatusText(
            { status: order.status, message: input.message },
            { language },
          ),
        )
      }
    } catch (err) {
      logger.warn(
        { err, orderId: order.id },
        "[order] could not tell the customer about the order",
      )
    }
  }

  /**
   * The trigger and webhook events of a placed or moved order: its status
   * event, and `productOrdered` once when it is placed. Best effort: the
   * order already stands.
   */
  private async announceOrderEvents(
    order: OrderModel,
    from: OrderStatus | null,
  ) {
    if (!order.contactId) {
      return
    }
    try {
      const detail = await this.getDetail({
        workspaceId: order.workspaceId,
        orderId: order.id,
      })
      const metadata: OrderEventMetadata = {
        orderId: detail.id,
        orderNumber: detail.number,
        // The status this event is about: the order may already have moved
        // on (accepted then shipped at once) by the time it is read back.
        status: order.status,
        source: detail.source,
        total: detail.total,
        currency: detail.currency,
        discountCode: detail.discountCode,
        channel: detail.channel,
        conversationId: detail.conversationId,
        products: detail.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          categoryIds: item.categoryId ? [item.categoryId] : [],
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
      }
      const contactInboxId = order.contactInboxId ?? undefined
      await emitOrderStatus(
        from === null ? "newOrder" : ORDER_STATUS_EVENTS[order.status],
        order.workspaceId,
        order.contactId,
        metadata,
        contactInboxId,
      )
      if (from === null) {
        await emitProductOrdered(
          order.workspaceId,
          order.contactId,
          metadata,
          contactInboxId,
        )
      }
    } catch (err) {
      logger.warn(
        { err, orderId: order.id },
        "[order] could not announce the order events",
      )
    }
  }

  /**
   * An order placed for a contact (an API call names only the contact) is
   * tied to that contact's latest conversation, so the order page links to it
   * and status messages reach it. A contact with no conversation keeps just
   * its id.
   */
  private async resolveConversation(
    workspaceId: string,
    contact: OrderContactRef | undefined,
  ): Promise<OrderContactRef | undefined> {
    if (!contact?.contactId || contact.conversationId) {
      return contact
    }
    try {
      const { conversation, contactInbox } =
        await conversationService.resolveContactInboxForSend({
          workspaceId,
          contactId: contact.contactId,
          inboxId: contact.inboxId ?? undefined,
        })
      return {
        contactId: contact.contactId,
        contactInboxId: contactInbox.id,
        inboxId: contactInbox.inboxId,
        conversationId: conversation.id,
        channel: contactInbox.channel,
      }
    } catch (err) {
      if (err instanceof ChatbotXException && err.code === "notFound") {
        return contact
      }
      throw err
    }
  }

  /**
   * Best effort: the status has already changed, so a send that fails (no
   * conversation, a closed messaging window) is logged, not thrown.
   */
  private async messageCustomer(order: OrderModel, text: string) {
    if (!order.contactId) {
      return
    }
    try {
      const { conversation, contactInbox } =
        await conversationService.resolveContactInboxForSend({
          workspaceId: order.workspaceId,
          contactId: order.contactId,
          inboxId: order.inboxId ?? undefined,
        })
      await messageService.createOutgoing({
        conversation,
        contactInbox,
        input: { text },
      })
    } catch (err) {
      logger.warn(
        { err, orderId: order.id, workspaceId: order.workspaceId },
        "[order] could not message the customer about a status change",
      )
    }
  }

  /**
   * Takes each line's quantity from its product. A tracked product without
   * enough stock refuses the order unless it allows out-of-stock purchase.
   */
  private async takeStock(input: {
    workspaceId: string
    lines: PricedLine[]
    products: Map<string, ProductForOrder>
    tx: DatabaseClient
  }): Promise<void> {
    const needed = quantitiesByProduct(input.lines)
    const locked = await productRepository.lockForStock(
      { workspaceId: input.workspaceId, productIds: [...needed.keys()] },
      input.tx,
    )
    for (const product of locked) {
      const quantity = needed.get(product.id) ?? 0
      if (product.inventoryPolicy !== "track" || quantity === 0) {
        continue
      }
      if (
        product.inventoryQuantity < quantity &&
        !product.allowOutOfStockPurchase
      ) {
        throw orderOutOfStockException(
          input.products.get(product.id)?.name ?? product.id,
        )
      }
      await productRepository.adjustInventory(
        {
          workspaceId: input.workspaceId,
          productId: product.id,
          delta: -quantity,
        },
        input.tx,
      )
    }
  }

  private async returnStock(input: {
    workspaceId: string
    orderId: string
    tx: DatabaseClient
  }) {
    const items = await orderRepository.listItems(
      { workspaceId: input.workspaceId, orderId: input.orderId },
      input.tx,
    )
    const quantities = quantitiesByProduct(
      items.map((item) => ({
        stockProductId: item.productId,
        quantity: item.quantity,
      })),
    )
    // Same lock order as taking stock, so a cancel and a new order on the
    // same products cannot deadlock.
    const locked = await productRepository.lockForStock(
      { workspaceId: input.workspaceId, productIds: [...quantities.keys()] },
      input.tx,
    )
    for (const product of locked) {
      await productRepository.adjustInventory(
        {
          workspaceId: input.workspaceId,
          productId: product.id,
          delta: quantities.get(product.id) ?? 0,
        },
        input.tx,
      )
    }
  }
}

type TransitionShortcutInput = {
  workspaceId: string
  orderId: string
  actor: OrderActor
  message?: string | null
}

export const orderService = new OrderService()
