import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type CartLine,
  type EcommerceSettings,
  isAwaitingOnlinePayment,
  type OrderShippingAddress,
  type PaymentMethod,
  type ShippingType,
} from "@chatbotx.io/database/partials"
import {
  cartRepository,
  ecommerceOpenHoursRepository,
  orderRepository,
  productRepository,
} from "@chatbotx.io/database/repositories"
import type { CartModel } from "@chatbotx.io/database/types"
import { emitCartAbandoned, emitCartItemChanged } from "@chatbotx.io/events"
import type { MessageInboundOrderEntity } from "@chatbotx.io/sdk"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { conversationService } from "../conversation/service"
import { isWithinOpenHours } from "../ecommerce-open-hours/is-open"
import { ecommerceSettingsService } from "../ecommerce-settings/service"
import {
  ChatbotXException,
  notFoundException,
  validationException,
} from "../errors"
import { logger } from "../logger"
import {
  buildCartSummaryText,
  checkoutButtonLabel,
} from "../order/customer-messages"
import {
  orderEmptyException,
  orderProductUnavailableException,
} from "../order/errors"
import { resolveCustomerMessageLanguage } from "../order/message-language"
import {
  findProductsForOrder,
  orderService,
  productCategoryIds,
  splitOrderableItems,
} from "../order/service"
import { orderPaymentService } from "../order-payment/service"
import { resolveWorkspaceAppUrl } from "../platform/settings"
import { productService } from "../product/service"
import { productCategoryService } from "../product-category/service"
import { vendorService } from "../vendor/service"
import { workspaceService } from "../workspace/service"
import { resolveWorkspaceFreezeReasonById } from "../workspace-lifecycle/with-blocked-owner-guard"
import {
  type WebshopClosedReason,
  webshopCartFullException,
  webshopClosedException,
  webshopRatingNotAllowedException,
} from "./errors"
import { buildWebshopButtonUrl } from "./link"

/** The customer a shop link was signed for. */
export type WebshopShopper = {
  workspaceId: string
  contactId: string
  contactInboxId: string | null
  conversationId: string | null
}

export type WebshopCheckoutForm = {
  /** Cash on delivery when left out. */
  paymentMethod?: PaymentMethod | null
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  shippingType?: ShippingType | null
  shippingAddress?: OrderShippingAddress | null
  note?: string | null
}

/** Most distinct lines (product and variant pairs) one cart may hold. */
export const MAX_CART_LINES = 100

/**
 * A line may only name a variant the product has and offers: required when
 * the product has enabled variants, absent when it has none.
 */
const assertCartVariant = (
  product: {
    name: string
    variants: Array<{ id: string; isEnabled: boolean }>
  },
  variantId: string | null,
) => {
  const enabled = product.variants.filter((variant) => variant.isEnabled)
  if (!variantId) {
    if (enabled.length > 0) {
      throw orderProductUnavailableException(
        `Choose a variant of "${product.name}".`,
      )
    }
    return
  }
  if (!enabled.some((variant) => variant.id === variantId)) {
    throw orderProductUnavailableException(
      `The chosen variant of "${product.name}" is not available.`,
    )
  }
}

const REQUIRED_FIELDS = [
  { setting: "requireName", field: "customerName" },
  { setting: "requireEmail", field: "customerEmail" },
  { setting: "requirePhone", field: "customerPhone" },
] as const

const isBlank = (value: string | null | undefined) => !value?.trim()

/** The quantity of one product (variant) line in the cart, 0 when absent. */
const lineQuantity = (
  lines: CartLine[],
  line: { productId: string; variantId: string | null },
) =>
  lines.find(
    (candidate) =>
      candidate.productId === line.productId &&
      (candidate.variantId ?? null) === (line.variantId ?? null),
  )?.quantity ?? 0

/** Adds `quantity` to a line, or a new line; 0 or less removes it. */
const changeLine = (
  lines: CartLine[],
  change: { productId: string; variantId: string | null; quantity: number },
  mode: "add" | "set",
): CartLine[] => {
  const sameLine = (line: CartLine) =>
    line.productId === change.productId &&
    (line.variantId ?? null) === (change.variantId ?? null)
  const current = lines.find(sameLine)
  const quantity =
    mode === "add"
      ? (current?.quantity ?? 0) + change.quantity
      : change.quantity
  const others = lines.filter((line) => !sameLine(line))
  return quantity > 0
    ? [
        ...others,
        {
          productId: change.productId,
          variantId: change.variantId ?? null,
          quantity: Math.min(quantity, 10_000),
        },
      ]
    : others
}

/**
 * The cart left once `ordered` is taken out of it: each ordered line's
 * quantity comes off its cart line, and lines added meanwhile stay. `null`
 * when the cart no longer holds all of `ordered` — a second submit of the
 * same checkout, after the first already took it.
 */
export const subtractOrderedLines = (
  cart: CartLine[],
  ordered: Array<{
    productId: string
    variantId?: string | null
    quantity: number
  }>,
): CartLine[] | null => {
  let left = cart
  for (const line of ordered) {
    const sameLine = (candidate: CartLine) =>
      candidate.productId === line.productId &&
      (candidate.variantId ?? null) === (line.variantId ?? null)
    const remaining = (left.find(sameLine)?.quantity ?? 0) - line.quantity
    if (remaining < 0) {
      return null
    }
    left = left.flatMap((candidate) => {
      if (!sameLine(candidate)) {
        return [candidate]
      }
      return remaining > 0 ? [{ ...candidate, quantity: remaining }] : []
    })
  }
  return left
}

/**
 * Everything the customer side of the store does: browse what the store
 * shows, keep a cart, check out, follow and rate their own orders. Prices
 * and stock always come from `orderService`, never from the cart.
 */
/** A row of "You may also like": enough to browse, not a second catalog. */
const RELATED_PRODUCTS_LIMIT = 10

class WebshopService extends BaseService {
  /** The shop's front page: its settings, visible categories, active vendors. */
  async getStorefront(workspaceId: string) {
    const [settings, workspace, categories, vendors] = await Promise.all([
      ecommerceSettingsService.get(workspaceId),
      workspaceService.findById({ id: workspaceId }),
      productCategoryService.list(workspaceId),
      vendorService.list({ workspaceId }),
    ])
    const ordering = await this.orderingState(workspaceId, settings, [])
    return {
      storeName: workspace.name,
      brandColor: workspace.brandColor,
      language: workspace.language,
      settings,
      ordering,
      categories: categories.filter((category) => category.isVisible),
      vendors: vendors.data.filter((vendor) => vendor.isActive),
    }
  }

  async listProducts(input: {
    workspaceId: string
    keyword?: string | null
    categoryId?: string | null
    vendorId?: string | null
    productIds?: string[] | null
    page?: number
    perPage?: number
  }) {
    return await productRepository.listForShop(input)
  }

  /**
   * "You may also like" under a product: other products the shop shows in its
   * category or sub-category, or sharing a tag with it — the closest first.
   */
  async listRelatedProducts(input: {
    workspaceId: string
    product: {
      id: string
      categoryId: string | null
      subcategoryId: string | null
      tags: string[]
    }
    limit?: number
  }) {
    return await productRepository.listRelatedForShop({
      workspaceId: input.workspaceId,
      product: input.product,
      limit: input.limit ?? RELATED_PRODUCTS_LIMIT,
    })
  }

  /** One product the shop shows, with its variants and options. */
  async getProduct(input: { workspaceId: string; productId: string }) {
    const { data } = await productRepository.listForShop({
      workspaceId: input.workspaceId,
      productIds: [input.productId],
    })
    if (data.length === 0) {
      throw notFoundException("Product not found")
    }
    const detail = await productService.findById(
      input.productId,
      input.workspaceId,
    )
    return {
      ...detail,
      vendorDiscountPercent: data[0]?.vendorDiscountPercent ?? 0,
      variants: detail.variants.filter((variant) => variant.isEnabled),
    }
  }

  /** The cart, priced as an order would be right now. */
  async getCart(input: {
    workspaceId: string
    contactId: string
    shippingType?: ShippingType | null
    /**
     * Also price the codes the cart can offer — on by default for the cart
     * page; off for callers that only need the totals.
     */
    listAvailableDiscounts?: boolean
  }) {
    const cart = await cartRepository.find(input)
    const lines = cart?.items ?? []
    const quote = await orderService.quote({
      workspaceId: input.workspaceId,
      items: lines,
      shippingType: input.shippingType,
      contactId: input.contactId,
      discountCode: cart?.discountCode,
      autoApplyDiscount: true,
      listAvailableDiscounts: input.listAvailableDiscounts ?? true,
    })
    return {
      items: lines,
      enteredDiscountCode: cart?.discountCode ?? null,
      ...quote,
    }
  }

  /**
   * Keeps the code the customer typed on their cart and prices the cart with
   * it. A code that cannot be used is not kept; the returned cart carries
   * `discountError` saying why.
   */
  async applyDiscountCode(input: {
    workspaceId: string
    contactId: string
    contactInboxId?: string | null
    code: string
    shippingType?: ShippingType | null
  }) {
    const code = input.code.trim()
    const cart = await cartRepository.find(input)
    const quote = await orderService.quote({
      workspaceId: input.workspaceId,
      items: cart?.items ?? [],
      shippingType: input.shippingType,
      contactId: input.contactId,
      discountCode: code,
      autoApplyDiscount: true,
    })
    if (!quote.discountError) {
      await cartRepository.setDiscountCode({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        contactInboxId: input.contactInboxId ?? null,
        discountCode: code,
      })
    }
    return quote
  }

  /**
   * A preview link's cart: priced exactly as a customer's would be, but for
   * no contact — the caller keeps its lines, and a preview never orders.
   */
  async getPreviewCart(input: {
    workspaceId: string
    items: CartLine[]
    discountCode?: string | null
    shippingType?: ShippingType | null
  }) {
    const quote = await orderService.quote({
      workspaceId: input.workspaceId,
      items: input.items,
      shippingType: input.shippingType,
      contactId: null,
      discountCode: input.discountCode,
      autoApplyDiscount: true,
      listAvailableDiscounts: true,
    })
    return {
      items: input.items,
      enteredDiscountCode: input.discountCode ?? null,
      ...quote,
    }
  }

  /**
   * The preview cart's lines after one change, checked like a customer's
   * (`changeCart`) but saved nowhere and announced to nobody.
   */
  async changePreviewCart(
    input: Omit<CartChangeInput, "contactId" | "contactInboxId"> & {
      items: CartLine[]
      mode: "add" | "set"
      maxLines: number
    },
  ): Promise<CartLine[]> {
    await this.assertCartLineCanGrow(input, input.items, input.mode)
    const after = changeLine(input.items, input, input.mode)
    if (after.length > Math.max(input.items.length, input.maxLines)) {
      throw webshopCartFullException(input.maxLines)
    }
    return after
  }

  /**
   * Prices the preview cart with the typed code; `discountError` says why a
   * code cannot be used, and then the caller does not keep it.
   */
  async quotePreviewDiscountCode(input: {
    workspaceId: string
    items: CartLine[]
    code: string
    shippingType?: ShippingType | null
  }) {
    return await orderService.quote({
      workspaceId: input.workspaceId,
      items: input.items,
      shippingType: input.shippingType,
      contactId: null,
      discountCode: input.code.trim(),
      autoApplyDiscount: true,
    })
  }

  async removeDiscountCode(input: { workspaceId: string; contactId: string }) {
    await cartRepository.setDiscountCode({
      ...input,
      contactInboxId: null,
      discountCode: null,
    })
  }

  /** One batch of abandoned carts, each claimed once (see `cartRepository`). */
  async claimAbandonedCarts(input: { limit: number; now?: Date }) {
    return await cartRepository.claimAbandoned({
      limit: input.limit,
      now: input.now ?? new Date(),
    })
  }

  /**
   * The reminder for a claimed abandoned cart: the `cartAbandoned` trigger
   * event, and the store's abandoned-cart flow run in the customer's
   * conversation — on the channel the cart came from when it is still there.
   * Nothing for a cart whose items can no longer be ordered, or once the
   * store turned the reminder off.
   */
  async remindAbandonedCart(
    cart: Pick<
      CartModel,
      "id" | "workspaceId" | "contactId" | "contactInboxId" | "lastActivityAt"
    >,
  ): Promise<"reminded" | "disabled" | "empty" | "stale"> {
    const settings = await ecommerceSettingsService.get(cart.workspaceId)
    if (settings.general.abandonedCartDelayMinutes === null) {
      return "disabled"
    }
    // The customer changed the cart after the scan claimed it: it is no
    // longer abandoned, and the change already re-armed its own reminder.
    const latest = await cartRepository.find(cart)
    if (latest?.lastActivityAt.getTime() !== cart.lastActivityAt.getTime()) {
      return "stale"
    }
    const priced = await this.getCart({
      workspaceId: cart.workspaceId,
      contactId: cart.contactId,
      listAvailableDiscounts: false,
    })
    if (priced.lines.length === 0) {
      return "empty"
    }
    const products = new Map(
      (
        await productRepository.findByIds({
          workspaceId: cart.workspaceId,
          productIds: priced.lines.flatMap((line) =>
            line.productId ? [line.productId] : [],
          ),
        })
      ).map((product) => [product.id, product]),
    )
    const target = await this.resolveReminderTarget(cart)
    await emitCartAbandoned(
      cart.workspaceId,
      cart.contactId,
      {
        channel: target?.channel ?? null,
        conversationId: target?.conversationId ?? null,
        itemCount: priced.lines.reduce((sum, line) => sum + line.quantity, 0),
        total: priced.totals.total,
        currency: priced.currency,
        items: priced.lines.map((line) => ({
          productId: line.productId ?? null,
          variantId: line.variantId ?? null,
          name: line.name,
          categoryIds: productCategoryIds(
            line.productId ? products.get(line.productId) : undefined,
          ),
          quantity: line.quantity,
        })),
      },
      target?.contactInboxId,
    )
    const flowId = settings.general.abandonedCartFlowId
    if (flowId && target) {
      await integrationQueue.add(
        IntegrationJobAction.sendFlow,
        {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: target.conversationId,
            contactInboxId: target.contactInboxId,
            flowId,
          },
        },
        // Once per abandonment: a cart changed and left again is a new one.
        {
          jobId: `abandoned-cart-flow-${cart.id}-${cart.lastActivityAt.getTime()}`,
        },
      )
    }
    return "reminded"
  }

  /** The conversation and channel a reminder goes to, if the contact has one. */
  private async resolveReminderTarget(
    cart: Pick<CartModel, "workspaceId" | "contactId" | "contactInboxId">,
  ) {
    try {
      const { conversation, contactInbox } =
        await conversationService.resolveContactInboxForSend({
          workspaceId: cart.workspaceId,
          contactId: cart.contactId,
        })
      const cartInbox =
        conversation.contactInboxes.find(
          (candidate) => candidate.id === cart.contactInboxId,
        ) ?? contactInbox
      return {
        conversationId: conversation.id,
        contactInboxId: cartInbox.id,
        channel: cartInbox.channel,
      }
    } catch (error) {
      if (error instanceof ChatbotXException && error.code === "notFound") {
        return null
      }
      throw error
    }
  }

  /** How many items are in the cart, for the cart badge. */
  async countCartItems(input: { workspaceId: string; contactId: string }) {
    const cart = await cartRepository.find(input)
    return (cart?.items ?? []).reduce((sum, line) => sum + line.quantity, 0)
  }

  async addToCart(input: CartChangeInput) {
    return await this.changeCart(input, "add")
  }

  async setCartQuantity(input: CartChangeInput) {
    return await this.changeCart(input, "set")
  }

  /**
   * A cart sent through WhatsApp's own catalog becomes the customer's shop
   * cart, so the CHECK OUT link opens it. Items not linked to a product here
   * cannot be ordered and are left out; how many is returned.
   */
  async replaceFromInboundCart(input: {
    workspaceId: string
    contactId: string
    contactInboxId: string | null
    cart: MessageInboundOrderEntity
  }) {
    let lines: CartLine[] = []
    let skipped = 0
    for (const item of input.cart.items) {
      if (!item.product) {
        skipped += 1
        continue
      }
      lines = changeLine(
        lines,
        {
          productId: item.product.productId,
          variantId: null,
          quantity: item.quantity,
        },
        "add",
      )
    }
    await cartRepository.upsert({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      contactInboxId: input.contactInboxId,
      items: lines,
    })
    const cart = await this.getCart(input)
    return { ...cart, skipped }
  }

  /**
   * The bot's answer to a cart sent from the WhatsApp catalog (spec image
   * 33): the cart becomes the contact's shop cart, and the reply sums it up
   * above a CHECK OUT button that opens it — or the store's own checkout
   * page when it uses one. `null` when there is nothing to answer: the store
   * takes no orders, or none of the items is sold here.
   */
  async buildInboundCartReply(input: {
    workspaceId: string
    contactId: string
    contactInboxId: string | null
    cart: MessageInboundOrderEntity
  }): Promise<{ text: string; buttonLabel: string; buttonUrl: string } | null> {
    const settings = await ecommerceSettingsService.get(input.workspaceId)
    if (!settings.general.orderingAvailable) {
      return null
    }
    const cart = await this.replaceFromInboundCart(input)
    if (cart.lines.length === 0) {
      return null
    }
    const [language, appUrl] = await Promise.all([
      resolveCustomerMessageLanguage(input),
      resolveWorkspaceAppUrl({ workspaceId: input.workspaceId }),
    ])
    const externalCheckout =
      settings.checkout.checkoutMode === "externalLink"
        ? settings.checkout.checkoutLink
        : null
    return {
      text: buildCartSummaryText(
        {
          ...cart.totals,
          discount: cart.discount,
          currency: cart.currency,
          itemCount: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
          skipped: cart.skipped + cart.unavailable.length,
        },
        { language, payments: settings.payments },
      ),
      buttonLabel: checkoutButtonLabel(language),
      buttonUrl:
        externalCheckout ??
        buildWebshopButtonUrl({
          appUrl,
          workspaceId: input.workspaceId,
          page: "cart",
        }),
    }
  }

  /**
   * Whether the store takes an order now: ordering is on and it is inside the
   * store's open hours and those of every vendor in `vendorOpenHoursIds`.
   */
  async orderingState(
    workspaceId: string,
    settings: EcommerceSettings,
    vendors: Array<{ name: string; openHoursId: string | null }>,
  ): Promise<
    | { open: true }
    | { open: false; reason: WebshopClosedReason; vendorName?: string }
  > {
    if (!settings.general.orderingAvailable) {
      return { open: false, reason: "orderingUnavailable" }
    }
    // A frozen workspace (trial expired, deletion pending) is read-only:
    // its shop still shows, but takes no orders.
    const { freezeReason } = await resolveWorkspaceFreezeReasonById(workspaceId)
    if (freezeReason) {
      return { open: false, reason: "orderingUnavailable" }
    }
    const scheduleIds = [
      settings.general.openHoursId,
      ...vendors.map((vendor) => vendor.openHoursId),
    ].filter((id): id is string => Boolean(id))
    if (scheduleIds.length === 0) {
      return { open: true }
    }
    const [schedules, workspace] = await Promise.all([
      ecommerceOpenHoursRepository.findByIds({ workspaceId, ids: scheduleIds }),
      workspaceService.findById({ id: workspaceId }),
    ])
    const isOpen = (scheduleId: string | null) => {
      const schedule = schedules.find((row) => row.id === scheduleId)
      // A schedule that was deleted leaves its users always open.
      return !schedule || isWithinOpenHours(schedule.ranges, workspace.timezone)
    }
    if (!isOpen(settings.general.openHoursId)) {
      return { open: false, reason: "outsideOpenHours" }
    }
    const closedVendor = vendors.find((vendor) => !isOpen(vendor.openHoursId))
    if (closedVendor) {
      return {
        open: false,
        reason: "outsideOpenHours",
        vendorName: closedVendor.name,
      }
    }
    return { open: true }
  }

  /**
   * Places the cart as an order for the shopper, paid the way they chose.
   * The store's rules are checked first (open, required fields, country);
   * prices, stock and minimums are `orderService.place`'s. The cart is
   * emptied in the same transaction, so a refused order keeps it.
   *
   * Paid online, the order is placed first (holding its stock) and the
   * provider's page opened for it: `paymentUrl` is where the customer goes
   * next. A page that cannot be opened cancels the order and puts its items
   * back in the cart, so the customer can pick another way to pay.
   */
  async checkout(input: {
    shopper: WebshopShopper
    form: WebshopCheckoutForm
  }) {
    const { shopper, form } = input
    const settings = await ecommerceSettingsService.getFresh(
      shopper.workspaceId,
    )
    // A store that checks out on its own external page (to take payment
    // there) takes no order through the built-in checkout. `productPage`
    // only changes the product's Buy button, so a cart filled another way
    // (a WhatsApp cart) still checks out here.
    if (settings.checkout.checkoutMode === "externalLink") {
      throw webshopClosedException("orderingUnavailable")
    }
    const cart = await cartRepository.find(shopper)
    const products = await findProductsForOrder({
      workspaceId: shopper.workspaceId,
      productIds: (cart?.items ?? []).map((line) => line.productId),
    })
    // Ordered as the cart shows it: an item no longer sold is left out (the
    // cart lists it as unavailable) and stays in the cart.
    const { orderable: lines, unavailable } = splitOrderableItems(
      products,
      cart?.items ?? [],
    )
    if (lines.length === 0) {
      throw unavailable.length > 0
        ? orderProductUnavailableException(
            "None of the items in the cart can be ordered.",
          )
        : orderEmptyException()
    }
    const orderedProductIds = new Set(lines.map((line) => line.productId))
    const vendors = [...products.values()].flatMap((product) =>
      orderedProductIds.has(product.id) && product.vendor
        ? [
            {
              name: product.vendor.name,
              openHoursId: product.vendor.openHoursId,
            },
          ]
        : [],
    )
    const ordering = await this.orderingState(
      shopper.workspaceId,
      settings,
      vendors,
    )
    if (!ordering.open) {
      throw webshopClosedException(ordering.reason, ordering.vendorName)
    }

    this.assertCheckoutForm(settings, form)

    const order = await orderService.place({
      workspaceId: shopper.workspaceId,
      source: "webshop",
      actor: { type: "contact" },
      contact: {
        contactId: shopper.contactId,
        contactInboxId: shopper.contactInboxId,
        conversationId: shopper.conversationId,
      },
      items: lines,
      customerName: form.customerName?.trim() || null,
      customerEmail: form.customerEmail?.trim() || null,
      customerPhone: form.customerPhone?.trim() || null,
      shippingType: form.shippingType,
      shippingAddress: form.shippingAddress,
      note: form.note?.trim() || null,
      discountCode: cart?.discountCode,
      autoApplyDiscount: true,
      paymentMethod: form.paymentMethod ?? "cod",
      onPlaced: async (_order, tx) => {
        // Only what was ordered leaves the cart: an item added in another
        // tab while this order was placed stays. A double-submitted checkout
        // read the same cart: the lock makes the second wait for the first,
        // find its items gone, and roll back instead of ordering twice.
        const locked = await cartRepository.findForUpdate(shopper, tx)
        const left = subtractOrderedLines(locked?.items ?? [], lines)
        if (!left) {
          throw orderEmptyException()
        }
        await this.keepCartLines(shopper, left, tx)
      },
    })
    if (!isAwaitingOnlinePayment(order)) {
      return { order, paymentUrl: null }
    }
    try {
      const { url } = await orderPaymentService.startCheckout({
        workspaceId: shopper.workspaceId,
        orderId: order.id,
      })
      return { order, paymentUrl: url }
    } catch (error) {
      await this.undoUnpayableOrder({
        shopper,
        orderId: order.id,
        lines,
        discountCode: cart?.discountCode ?? null,
      })
      throw error
    }
  }

  /**
   * The provider's page could not be opened for an order just placed: the
   * order is cancelled (its stock and code given back) and its items return
   * to the cart, so nothing was lost and the customer can try again.
   */
  private async undoUnpayableOrder(input: {
    shopper: WebshopShopper
    orderId: string
    lines: Array<{
      productId: string
      variantId?: string | null
      quantity: number
    }>
    discountCode: string | null
  }) {
    const { shopper } = input
    try {
      await orderService.cancel({
        workspaceId: shopper.workspaceId,
        orderId: input.orderId,
        actor: { type: "system" },
        message: null,
      })
      await db.transaction(async (tx) => {
        const locked = await cartRepository.lockOrCreate(
          {
            workspaceId: shopper.workspaceId,
            contactId: shopper.contactId,
            contactInboxId: shopper.contactInboxId,
          },
          tx,
        )
        const restored = input.lines.reduce(
          (current, line) =>
            changeLine(
              current,
              {
                productId: line.productId,
                variantId: line.variantId ?? null,
                quantity: line.quantity,
              },
              "add",
            ),
          locked?.items ?? [],
        )
        await cartRepository.upsert(
          {
            workspaceId: shopper.workspaceId,
            contactId: shopper.contactId,
            contactInboxId: shopper.contactInboxId,
            items: restored,
          },
          tx,
        )
        if (input.discountCode) {
          await cartRepository.setDiscountCode(
            {
              workspaceId: shopper.workspaceId,
              contactId: shopper.contactId,
              contactInboxId: shopper.contactInboxId,
              discountCode: input.discountCode,
            },
            tx,
          )
        }
      })
    } catch (err) {
      logger.error(
        { err, orderId: input.orderId, workspaceId: shopper.workspaceId },
        "[webshop] could not undo an order whose payment could not start",
      )
    }
  }

  /** One of the shopper's own orders — another customer's is a 404. */
  async getCustomerOrder(input: {
    workspaceId: string
    contactId: string
    orderId: string
  }) {
    const order = await orderService.getDetail(input)
    if (order.contactId !== input.contactId) {
      throw notFoundException("Order does not exist.")
    }
    return order
  }

  /**
   * The provider's page for one of the shopper's own orders still waiting for
   * its online payment (the order page's Pay button).
   */
  async payCustomerOrder(input: {
    workspaceId: string
    contactId: string
    orderId: string
  }) {
    await this.getCustomerOrder(input)
    return await orderPaymentService.startCheckout(input)
  }

  /**
   * The shopper came back from the provider's page: the payment is read back
   * so the order shows paid at once, then the order as it stands now.
   */
  async refreshCustomerOrderPayment(input: {
    workspaceId: string
    contactId: string
    orderId: string
  }) {
    const order = await this.getCustomerOrder(input)
    if (!isAwaitingOnlinePayment(order)) {
      return order
    }
    await orderPaymentService.syncOrder(input)
    return await this.getCustomerOrder(input)
  }

  /** A customer rates their completed order, when the store allows it. */
  async rateOrder(input: {
    workspaceId: string
    contactId: string
    orderId: string
    rating: number
    comment?: string | null
  }) {
    const [order, settings] = await Promise.all([
      this.getCustomerOrder(input),
      ecommerceSettingsService.get(input.workspaceId),
    ])
    if (!settings.general.allowRateOrders || order.status !== "concluded") {
      throw webshopRatingNotAllowedException()
    }
    await orderRepository.setRating({
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      rating: input.rating,
      ratingComment: input.comment?.trim() || null,
    })
    await this.invalidateCacheTags(`orders:${input.workspaceId}`)
    return await orderService.getDetail(input)
  }

  /**
   * Only what the shop shows can go in the cart (or grow in it), in either
   * mode; lowering a line is always allowed.
   */
  private async assertCartLineCanGrow(
    change: {
      workspaceId: string
      productId: string
      variantId: string | null
      quantity: number
    },
    before: CartLine[],
    mode: "add" | "set",
  ) {
    if (
      lineQuantity(changeLine(before, change, mode), change) <=
      lineQuantity(before, change)
    ) {
      return
    }
    const product = await this.getProduct({
      workspaceId: change.workspaceId,
      productId: change.productId,
    })
    assertCartVariant(product, change.variantId ?? null)
  }

  private async changeCart(input: CartChangeInput, mode: "add" | "set") {
    const current = await cartRepository.find(input)
    await this.assertCartLineCanGrow(input, current?.items ?? [], mode)
    // Under the cart's lock: two quick taps apply one after the other, and
    // each event reports the change it actually made.
    const change = await db.transaction(async (tx) => {
      const cart = await cartRepository.lockOrCreate(
        {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          contactInboxId: input.contactInboxId ?? null,
        },
        tx,
      )
      const lockedBefore = cart?.items ?? []
      const after = changeLine(lockedBefore, input, mode)
      if (after.length > Math.max(lockedBefore.length, MAX_CART_LINES)) {
        throw webshopCartFullException(MAX_CART_LINES)
      }
      await cartRepository.upsert(
        {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          contactInboxId: input.contactInboxId ?? null,
          items: after,
        },
        tx,
      )
      return { before: lockedBefore, after }
    })
    await this.announceCartChange(input, change.before, change.after)
    // Just the lines: pricing the whole cart (and its offered codes) on every
    // tap is left to the cart page, which reads it with `getCart`.
    return { items: change.after }
  }

  /**
   * `productAddedToCart` (with `categoryAddedToCart`) or
   * `productRemovedFromCart` for a change of the line's quantity. Best
   * effort: the cart is already saved.
   */
  private async announceCartChange(
    input: CartChangeInput,
    before: CartLine[],
    after: CartLine[],
  ) {
    const quantity = lineQuantity(after, input)
    const change = quantity - lineQuantity(before, input)
    if (change === 0) {
      return
    }
    try {
      const [product] = await productRepository.findForOrder({
        workspaceId: input.workspaceId,
        productIds: [input.productId],
      })
      await emitCartItemChanged(
        input.workspaceId,
        input.contactId,
        {
          channel: "webshop",
          product: {
            productId: input.productId,
            variantId: input.variantId ?? null,
            name: product?.name ?? "",
            categoryIds: productCategoryIds(product),
          },
          quantity,
          change,
        },
        input.contactInboxId ?? undefined,
      )
    } catch (err) {
      logger.warn(
        { err, productId: input.productId },
        "[webshop] could not announce the cart change",
      )
    }
  }

  /** After an order: the lines left in the cart, and the used code gone. */
  private async keepCartLines(
    shopper: WebshopShopper,
    items: CartLine[],
    tx: DatabaseClient,
  ) {
    await cartRepository.upsert(
      {
        workspaceId: shopper.workspaceId,
        contactId: shopper.contactId,
        contactInboxId: shopper.contactInboxId,
        items,
      },
      tx,
    )
    await cartRepository.setDiscountCode(
      {
        workspaceId: shopper.workspaceId,
        contactId: shopper.contactId,
        contactInboxId: shopper.contactInboxId,
        discountCode: null,
      },
      tx,
    )
  }

  /** The buyer fields the store requires, and a country it ships to. */
  private assertCheckoutForm(
    settings: EcommerceSettings,
    form: WebshopCheckoutForm,
  ) {
    for (const { setting, field } of REQUIRED_FIELDS) {
      if (settings.checkout[setting] && isBlank(form[field])) {
        throw validationException(field, `${field} is required.`)
      }
    }
    const delivering =
      (form.shippingType ?? "delivery") === "delivery" &&
      settings.shipping.shippingType !== "none" &&
      settings.shipping.shippingType !== "pickup"
    if (!delivering) {
      return
    }
    const address = form.shippingAddress
    if (isBlank(address?.line1)) {
      throw validationException("shippingAddress.line1", "Address is required.")
    }
    if (settings.checkout.requireState && isBlank(address?.state)) {
      throw validationException("shippingAddress.state", "State is required.")
    }
    if (settings.checkout.requireZip && isBlank(address?.zip)) {
      throw validationException("shippingAddress.zip", "ZIP code is required.")
    }
    const countries = settings.shipping.shippingCountries
    const country = address?.country?.toUpperCase()
    if (countries.length > 0 && !(country && countries.includes(country))) {
      throw validationException(
        "shippingAddress.country",
        "The store does not ship to this country.",
      )
    }
  }
}

type CartChangeInput = {
  workspaceId: string
  contactId: string
  contactInboxId?: string | null
  productId: string
  variantId: string | null
  quantity: number
}

export const webshopService = new WebshopService()
