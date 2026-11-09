import type { WoocommerceSyncScope } from "@chatbotx.io/database/partials"
import {
  externalStoreRepository,
  type OrderItemInsertValues,
  orderRepository,
  productCategoryRepository,
  vendorRepository,
  woocommerceRepository,
} from "@chatbotx.io/database/repositories"
import type { IntegrationWoocommerceModel } from "@chatbotx.io/database/types"
import {
  getWooCommerceCoupon,
  getWooCommerceOrder,
  getWooCommerceProduct,
  listWooCommerceCoupons,
  listWooCommerceOrders,
  listWooCommerceProducts,
  listWooCommerceVariations,
  WOOCOMMERCE_ORDER_SYNC_DAYS,
  WooCommerceApiError,
  type WooCommerceCoupon,
  type WooCommerceCredentials,
  type WooCommerceOrder,
  type WooCommerceProduct,
} from "@chatbotx.io/integration-woocommerce"
import { roundMoney } from "@chatbotx.io/utils/money"
import { BaseService } from "../base.service"
import { ecommerceSettingsService } from "../ecommerce-settings/service"
import {
  EXTERNAL_CONTACT_ATTRIBUTE,
  nextMirroredStatus,
  removeOrderedFromCart,
  resolveExternalOrderContact,
  syncErrorMessage,
  variantLabelOf,
} from "../external-store/orders"
import { logger } from "../logger"
import { orderService } from "../order/service"
import { resolveWooCommerceCredentials } from "./auth"
import { wooCommerceIntegrationService } from "./integration.service"
import {
  gmtDate,
  isMirrorableWooCommerceOrder,
  isOrderableWooCommerceProduct,
  mapWooCommerceAddress,
  mapWooCommerceCoupon,
  mapWooCommerceOrderState,
  mapWooCommerceProduct,
  wooCommerceAnyAttributesOf,
  wooCommerceCustomerName,
  wooCommerceOrderContactIdentifiers,
  wooCommerceOrderExternalId,
  wooCommerceOrderMeta,
  wooCommerceVariationIdOf,
} from "./mappers"

/**
 * The order meta our Web Checkout stamps on the pending order it creates:
 * such an order is not mirrored until it is paid (or otherwise moves on),
 * so an abandoned payment page tells nobody anything.
 */
export const WOOCOMMERCE_CHECKOUT_META = "cbx_checkout"
export const WOOCOMMERCE_WEB_CHECKOUT = "web"

/** Statuses of an unpaid order that has not gone anywhere yet. */
const NOT_YET_PLACED = new Set(["pending", "failed", "cancelled"])

/** Products read again for their stock after one order. */
const STOCK_REFRESH_LIMIT = 20

type SyncContext = {
  row: IntegrationWoocommerceModel
  credentials: WooCommerceCredentials
}

type LineMeta = Array<{
  key: string
  value: unknown
  display_key?: string
  display_value?: unknown
}>

const sameText = (left: unknown, right: string) =>
  typeof left === "string" &&
  left.trim().toLowerCase() === right.trim().toLowerCase()

/**
 * Our variant an order line sold: the variation's own, or — for a variation
 * with "Any …" attributes — the one whose picked values the line's meta shows
 * (`Size: M`, as WooCommerce's checkout and ours stamp it).
 */
const matchLineVariant = <Variant extends { externalId: string | null }>(
  variants: Variant[],
  variationId: string,
  meta: LineMeta,
): Variant | undefined => {
  const candidates = variants.filter(
    (variant) =>
      variant.externalId &&
      wooCommerceVariationIdOf(variant.externalId) === variationId,
  )
  const exact = candidates.find((variant) => variant.externalId === variationId)
  if (exact) {
    return exact
  }
  return candidates.find((variant) =>
    wooCommerceAnyAttributesOf(variant.externalId as string).every((choice) =>
      meta.some(
        (entry) =>
          (sameText(entry.display_key, choice.name) ||
            sameText(entry.key, choice.name)) &&
          (sameText(entry.display_value, choice.value) ||
            sameText(entry.value, choice.value)),
      ),
    ),
  )
}

class WooCommerceSyncService extends BaseService {
  /**
   * The worker's full sync: catalog, coupons and the last 60 days of orders,
   * then the counts on the connection. The store refusing the keys marks the
   * connection invalid instead of retrying.
   */
  async run(input: { workspaceId: string; scope: WoocommerceSyncScope }) {
    const row = await woocommerceRepository.findIntegration(input.workspaceId)
    if (!row) {
      return
    }
    await woocommerceRepository.updateIntegration({
      workspaceId: input.workspaceId,
      values: { syncStatus: "running", syncError: null },
    })
    try {
      // The store's currency first: products are priced in it.
      await wooCommerceIntegrationService.refreshStoreCurrency(
        input.workspaceId,
      )
      const refreshed =
        (await woocommerceRepository.findIntegration(input.workspaceId)) ?? row
      const context: SyncContext = {
        row: refreshed,
        credentials: await resolveWooCommerceCredentials(refreshed),
      }
      let orderCount = row.orderCount
      if (input.scope !== "orders") {
        await this.syncCatalog(context)
        await this.syncCoupons(context)
      }
      if (input.scope !== "products") {
        orderCount = await this.syncOrders(context)
      }
      await woocommerceRepository.updateIntegration({
        workspaceId: input.workspaceId,
        values: {
          syncStatus: "succeeded",
          syncError: null,
          lastSyncedAt: new Date(),
          productCount: await externalStoreRepository.countProducts({
            workspaceId: input.workspaceId,
            source: "woocommerce",
          }),
          orderCount,
          status: "active",
          statusReason: null,
        },
      })
    } catch (error) {
      const message = syncErrorMessage(error)
      await woocommerceRepository.updateIntegration({
        workspaceId: input.workspaceId,
        values: { syncStatus: "failed", syncError: message },
      })
      if (error instanceof WooCommerceApiError && error.unauthorized) {
        await wooCommerceIntegrationService.markInvalid(
          input.workspaceId,
          message,
        )
        return
      }
      throw error
    } finally {
      await this.invalidateCacheTags([
        `orders:${input.workspaceId}`,
        `products:${input.workspaceId}`,
      ])
    }
  }

  // ─── Webhook handlers: each reads the object back from the store ───────

  /**
   * A product (or one of its variations: the variable product is read) was
   * created, changed or restored. Gone from the store, it is removed here.
   */
  async syncProduct(
    workspaceId: string,
    productId: string,
    known?: SyncContext,
  ) {
    const context = known ?? (await this.context(workspaceId))
    if (!context) {
      return
    }
    const product = await getWooCommerceProduct(context.credentials, productId)
    if (product && product.parent_id > 0) {
      await this.syncProduct(workspaceId, String(product.parent_id), context)
      return
    }
    if (product && isOrderableWooCommerceProduct(product)) {
      await this.saveProduct(context, product)
      await this.invalidateCacheTags(`products:${workspaceId}`)
    } else {
      await this.deleteProduct(workspaceId, productId)
    }
  }

  /**
   * A product was deleted. WooCommerce sends the same topic for a deleted
   * variation, with the variation's id: its variable product is read again
   * instead, so the variant goes and the product stays.
   */
  async deleteProduct(workspaceId: string, productId: string) {
    const [variant] = await externalStoreRepository.findVariantsForVariations({
      workspaceId,
      source: "woocommerce",
      variationIds: [productId],
    })
    if (variant?.productExternalId) {
      await this.syncProduct(workspaceId, variant.productExternalId)
      return
    }
    await externalStoreRepository.deleteProductByExternalId({
      workspaceId,
      source: "woocommerce",
      externalId: productId,
    })
    await this.invalidateCacheTags(`products:${workspaceId}`)
  }

  async syncCoupon(workspaceId: string, couponId: string) {
    const context = await this.context(workspaceId)
    if (!context) {
      return
    }
    const coupon = await getWooCommerceCoupon(context.credentials, couponId)
    const saved = coupon ? await this.saveCoupon(context, coupon) : false
    if (!saved) {
      await this.deleteCoupon(workspaceId, couponId)
    }
  }

  async deleteCoupon(workspaceId: string, couponId: string) {
    await externalStoreRepository.deleteDiscountByExternalId({
      workspaceId,
      source: "woocommerce",
      externalId: couponId,
    })
  }

  /**
   * An order was created or changed. Stock WooCommerce took or gave back for
   * it sends no product webhook, so the products it lists are read again.
   */
  async syncOrder(workspaceId: string, orderId: string) {
    const context = await this.context(workspaceId)
    if (!context) {
      return
    }
    const order = await getWooCommerceOrder(context.credentials, orderId)
    if (!order) {
      return
    }
    // Only a store that sells through WooCommerce tells customers and fires
    // its triggers; one on another source just keeps the mirror.
    const announce =
      (await ecommerceSettingsService.storeSource(workspaceId)) ===
      "woocommerce"
    await this.mirrorOrder(context.row, order, { announce })
    await this.refreshStock(context, order)
  }

  /**
   * Writes one WooCommerce order through `orderService.syncExternal`, linked
   * to the contact who checked out from a shop link when it can be told.
   * `announce` is off for history a full sync pulls in, so old orders send
   * no messages and fire no triggers. Returns null for an order that is not
   * mirrored (yet): a draft, or a Web Checkout order still waiting for
   * payment.
   */
  async mirrorOrder(
    row: IntegrationWoocommerceModel,
    order: WooCommerceOrder,
    options: { announce: boolean },
  ) {
    if (!isMirrorableWooCommerceOrder(order)) {
      return null
    }
    const externalId = wooCommerceOrderExternalId(row.siteUrl, order.id)
    if (
      wooCommerceOrderMeta(order, WOOCOMMERCE_CHECKOUT_META) ===
        WOOCOMMERCE_WEB_CHECKOUT &&
      NOT_YET_PLACED.has(order.status) &&
      !(await orderRepository.findByExternalId({
        workspaceId: row.workspaceId,
        externalId,
      }))
    ) {
      return null
    }

    const state = mapWooCommerceOrderState(order)
    const contact = await resolveExternalOrderContact({
      workspaceId: row.workspaceId,
      reference: wooCommerceOrderMeta(order, EXTERNAL_CONTACT_ATTRIBUTE),
      identifiers: wooCommerceOrderContactIdentifiers(order),
    })
    const currency = order.currency.toUpperCase() || row.currency
    const items = await this.mapOrderItems(row.workspaceId, order, currency)
    const money = (amount: number) => roundMoney(amount, currency)
    const subtotal = money(
      order.line_items.reduce((sum, line) => sum + line.subtotal, 0),
    )
    const shippingAddress = mapWooCommerceAddress(order.shipping)

    const result = await orderService.syncExternal({
      workspaceId: row.workspaceId,
      source: "woocommerce",
      externalId,
      announce: options.announce,
      status: state.status,
      nextStatus: nextMirroredStatus,
      values: {
        externalName: `#${order.number || order.id}`,
        contactId: contact?.contactId ?? null,
        contactInboxId: contact?.contactInboxId ?? null,
        conversationId: contact?.conversationId ?? null,
        inboxId: null,
        channel: null,
        paymentMethod: "cod",
        paymentStatus: state.paymentStatus,
        paidAt: gmtDate(order.date_paid_gmt),
        fulfillmentStatus: state.fulfillmentStatus,
        trackingCompany: state.tracking.company,
        trackingNumber: state.tracking.number,
        trackingUrl: state.tracking.url,
        currency,
        subtotal,
        discountTotal: money(order.discount_total),
        couponDiscount: 0,
        shippingTotal: money(order.shipping_total),
        serviceFeeTotal: 0,
        taxTotal: money(order.total_tax),
        total: money(order.total),
        discountCodeId: null,
        discountCode: order.coupon_lines[0]?.code || null,
        customerName: wooCommerceCustomerName(order),
        customerEmail: order.billing.email || null,
        customerPhone: order.billing.phone || order.shipping.phone || null,
        shippingType: shippingAddress ? "delivery" : null,
        shippingAddress,
        note: order.customer_note || null,
        cancelReason: null,
        ...(order.date_created_gmt
          ? { createdAt: gmtDate(order.date_created_gmt) as Date }
          : {}),
      },
      items,
    })
    if (result.created && contact?.fromShopLink) {
      await removeOrderedFromCart({
        workspaceId: row.workspaceId,
        contact,
        items,
      })
    }
    return result
  }

  // ─── Full sync steps ───────────────────────────────────────────────────

  private async syncCatalog(context: SyncContext) {
    const keep: string[] = []
    await listWooCommerceProducts(context.credentials, async (products) => {
      for (const product of products) {
        if (!isOrderableWooCommerceProduct(product)) {
          continue
        }
        await this.saveProduct(context, product)
        keep.push(String(product.id))
      }
    })
    // Only after every page was read, so a failed page deletes nothing.
    await externalStoreRepository.deleteProductsNotIn({
      workspaceId: context.row.workspaceId,
      source: "woocommerce",
      keepExternalIds: keep,
    })
  }

  private async syncCoupons(context: SyncContext) {
    const keep: string[] = []
    await listWooCommerceCoupons(context.credentials, async (coupons) => {
      for (const coupon of coupons) {
        if (await this.saveCoupon(context, coupon)) {
          keep.push(String(coupon.id))
        }
      }
    })
    await externalStoreRepository.deleteDiscountsNotIn({
      workspaceId: context.row.workspaceId,
      source: "woocommerce",
      keepExternalIds: keep,
    })
  }

  private async syncOrders(context: SyncContext): Promise<number> {
    const createdAfter = new Date(
      Date.now() - WOOCOMMERCE_ORDER_SYNC_DAYS * 24 * 60 * 60 * 1000,
    )
    let count = 0
    await listWooCommerceOrders(
      context.credentials,
      { createdAfter },
      async (orders) => {
        for (const order of orders) {
          try {
            const mirrored = await this.mirrorOrder(context.row, order, {
              announce: false,
            })
            if (mirrored) {
              count++
            }
          } catch (err) {
            // One bad order must not stop the rest of the history.
            logger.warn(
              {
                err,
                workspaceId: context.row.workspaceId,
                orderId: order.id,
              },
              "[woocommerce] could not mirror an order",
            )
          }
        }
      },
    )
    return count
  }

  // ─── Writers ───────────────────────────────────────────────────────────

  private async saveProduct(context: SyncContext, product: WooCommerceProduct) {
    const { workspaceId } = context.row
    const variations =
      product.type === "variable"
        ? await listWooCommerceVariations(context.credentials, product.id)
        : []
    const mapped = mapWooCommerceProduct(product, variations, {
      currency: context.row.currency,
    })
    const categoryId = mapped.categoryName
      ? ((
          await productCategoryRepository.createMissingByName({
            workspaceId,
            names: [mapped.categoryName],
            source: "woocommerce",
          })
        )[0]?.id ?? null)
      : null
    let vendorId: string | null = null
    if (mapped.vendorName) {
      await vendorRepository.createMissing({
        workspaceId,
        names: [mapped.vendorName],
        source: "woocommerce",
      })
      vendorId =
        (
          await vendorRepository.findByNames({
            workspaceId,
            names: [mapped.vendorName],
            source: "woocommerce",
          })
        )[0]?.id ?? null
    }
    await externalStoreRepository.upsertProduct({
      workspaceId,
      source: "woocommerce",
      externalId: mapped.externalId,
      values: { ...mapped.values, categoryId, vendorId },
      options: mapped.options,
      variants: mapped.variants,
    })
  }

  /** False when the coupon cannot be priced in our cart. */
  private async saveCoupon(
    context: SyncContext,
    coupon: WooCommerceCoupon,
  ): Promise<boolean> {
    const mapped = mapWooCommerceCoupon(coupon)
    if (!mapped) {
      return false
    }
    const { workspaceId } = context.row
    let productIds: string[] = []
    if (mapped.appliesTo === "products") {
      const products = await externalStoreRepository.findProductsByExternalIds({
        workspaceId,
        source: "woocommerce",
        externalIds: mapped.productExternalIds,
      })
      productIds = products.map((product) => product.id)
      if (productIds.length === 0) {
        return false
      }
    }
    const {
      externalId,
      productExternalIds: _productExternalIds,
      ...values
    } = mapped
    await externalStoreRepository.upsertDiscount({
      workspaceId,
      source: "woocommerce",
      externalId,
      values: {
        ...values,
        productIds,
        autoApply: false,
        eligibility: "everyone",
        customerFilter: null,
        categoryId: null,
      },
    })
    return true
  }

  private async mapOrderItems(
    workspaceId: string,
    order: WooCommerceOrder,
    currency: string,
  ): Promise<OrderItemInsertValues[]> {
    const lines = order.line_items
    const variants = await externalStoreRepository.findVariantsForVariations({
      workspaceId,
      source: "woocommerce",
      variationIds: lines.flatMap((line) =>
        line.variation_id ? [String(line.variation_id)] : [],
      ),
    })
    const products = await externalStoreRepository.findProductsByExternalIds({
      workspaceId,
      source: "woocommerce",
      externalIds: lines.flatMap((line) =>
        line.product_id ? [String(line.product_id)] : [],
      ),
    })
    const byProduct = new Map(
      products.map((product) => [product.externalId, product]),
    )

    return lines.map((line) => {
      const variant = line.variation_id
        ? matchLineVariant(variants, String(line.variation_id), line.meta_data)
        : undefined
      const product = line.product_id
        ? byProduct.get(String(line.product_id))
        : undefined
      const quantity = Math.max(1, line.quantity)
      const unitPrice = roundMoney(line.subtotal / quantity, currency)
      const gross = roundMoney(line.subtotal, currency)
      const lineDiscount = roundMoney(
        Math.max(0, line.subtotal - line.total),
        currency,
      )
      const variantMeta = line.meta_data
        .filter(
          (meta) =>
            !meta.key.startsWith("_") &&
            typeof (meta.display_value ?? meta.value) === "string",
        )
        .map(
          (meta) =>
            `${meta.display_key ?? meta.key}: ${String(meta.display_value ?? meta.value)}`,
        )
        .join(", ")
      return {
        productId: variant?.productId ?? product?.id ?? null,
        variantId: variant?.variantId ?? null,
        vendorId: variant?.vendorId ?? product?.vendorId ?? null,
        categoryId: variant?.categoryId ?? product?.categoryId ?? null,
        name: line.name,
        variantLabel:
          variantLabelOf(variant?.combination ?? null) ?? (variantMeta || null),
        combination: variant?.combination ?? null,
        sku: line.sku,
        retailerId: null,
        imageUrl: line.image?.src || null,
        vendorName: null,
        unitPrice,
        quantity: line.quantity,
        stockTaken: 0,
        discountPercent:
          gross > 0 ? roundMoney((lineDiscount / gross) * 100, "USD") : 0,
        taxPercent: 0,
        discountTotal: lineDiscount,
        taxTotal: 0,
        lineTotal: roundMoney(gross - lineDiscount, currency),
      }
    })
  }

  /** Reads the ordered products again: their stock moved with the order. */
  private async refreshStock(context: SyncContext, order: WooCommerceOrder) {
    const productIds = [
      ...new Set(
        order.line_items.flatMap((line) =>
          line.product_id ? [String(line.product_id)] : [],
        ),
      ),
    ].slice(0, STOCK_REFRESH_LIMIT)
    for (const productId of productIds) {
      try {
        await this.syncProduct(context.row.workspaceId, productId, context)
      } catch (err) {
        logger.warn(
          { err, workspaceId: context.row.workspaceId, productId },
          "[woocommerce] could not refresh a product's stock",
        )
      }
    }
  }

  private async context(workspaceId: string): Promise<SyncContext | null> {
    const row = await woocommerceRepository.findIntegration(workspaceId)
    if (row?.status !== "active") {
      return null
    }
    return { row, credentials: await resolveWooCommerceCredentials(row) }
  }
}

export const wooCommerceSyncService = new WooCommerceSyncService()
