import { db } from "@chatbotx.io/database/client"
import type { ShopifySyncScope } from "@chatbotx.io/database/partials"
import {
  cartRepository,
  type OrderItemInsertValues,
  productCategoryRepository,
  shopifyRepository,
  vendorRepository,
} from "@chatbotx.io/database/repositories"
import type { IntegrationShopifyModel } from "@chatbotx.io/database/types"
import { verifyShopToken } from "@chatbotx.io/encryption/shop-token"
import {
  getShopifyCodeDiscount,
  getShopifyInventoryItemProductId,
  getShopifyOrder,
  getShopifyProduct,
  listShopifyCodeDiscounts,
  listShopifyOrders,
  listShopifyProducts,
  SHOPIFY_ORDER_SYNC_DAYS,
  ShopifyApiError,
  type ShopifyCredentials,
  type ShopifyOrder,
  type ShopifyProduct,
} from "@chatbotx.io/integration-shopify"
import { roundMoney } from "@chatbotx.io/utils/money"
import { BaseService } from "../base.service"
import { contactService } from "../contact/service"
import { ecommerceSettingsService } from "../ecommerce-settings/service"
import { logger } from "../logger"
import { orderService } from "../order/service"
import { resolveShopifyCredentials } from "./auth"
import { shopifyIntegrationService } from "./integration.service"
import {
  mapShopifyAddress,
  mapShopifyDiscount,
  mapShopifyOrderState,
  mapShopifyProduct,
  nextMirroredStatus,
  shopifyOrderContactIdentifiers,
} from "./mappers"

/** The order note attribute a web shop checkout stamps with the customer. */
export const SHOPIFY_CONTACT_ATTRIBUTE = "cbx_ref"

const SYNC_ERROR_LENGTH = 500

type SyncContext = {
  row: IntegrationShopifyModel
  credentials: ShopifyCredentials
}

/** "Size: M, Color: Black" — as our own order lines label a variant. */
const variantLabelOf = (combination: Record<string, string> | null) =>
  combination
    ? Object.entries(combination)
        .map(([option, value]) => `${option}: ${value}`)
        .join(", ")
    : null

class ShopifySyncService extends BaseService {
  /**
   * The worker's full sync: catalog, discount codes and the last 60 days of
   * orders (all `read_orders` reaches), then the counts on the connection.
   * Shopify refusing the credentials marks the connection invalid instead of
   * retrying.
   */
  async run(input: { workspaceId: string; scope: ShopifySyncScope }) {
    const row = await shopifyRepository.findIntegration(input.workspaceId)
    if (!row) {
      return
    }
    await shopifyRepository.updateIntegration({
      workspaceId: input.workspaceId,
      values: { syncStatus: "running", syncError: null },
    })
    try {
      const context: SyncContext = {
        row,
        credentials: await resolveShopifyCredentials(row),
      }
      let orderCount = row.orderCount
      if (input.scope !== "orders") {
        await this.syncCatalog(context)
        await this.syncDiscounts(context)
      }
      if (input.scope !== "products") {
        orderCount = await this.syncOrders(context)
      }
      await shopifyRepository.updateIntegration({
        workspaceId: input.workspaceId,
        values: {
          syncStatus: "succeeded",
          syncError: null,
          lastSyncedAt: new Date(),
          productCount: await shopifyRepository.countProducts(
            input.workspaceId,
          ),
          orderCount,
          status: "active",
          statusReason: null,
        },
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The sync failed."
      await shopifyRepository.updateIntegration({
        workspaceId: input.workspaceId,
        values: {
          syncStatus: "failed",
          syncError: message.slice(0, SYNC_ERROR_LENGTH),
        },
      })
      if (error instanceof ShopifyApiError && error.unauthorized) {
        await shopifyIntegrationService.markInvalid(input.workspaceId, message)
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

  // ─── Webhook handlers: each reads the object back from Shopify ─────────

  async syncProduct(workspaceId: string, productId: string) {
    const context = await this.context(workspaceId)
    if (!context) {
      return
    }
    const product = await getShopifyProduct(context.credentials, productId)
    if (product) {
      await this.saveProduct(context, product)
    } else {
      await shopifyRepository.deleteProductByExternalId({
        workspaceId,
        externalId: productId,
      })
    }
    await this.invalidateCacheTags(`products:${workspaceId}`)
  }

  async deleteProduct(workspaceId: string, productId: string) {
    await shopifyRepository.deleteProductByExternalId({
      workspaceId,
      externalId: productId,
    })
    await this.invalidateCacheTags(`products:${workspaceId}`)
  }

  /** Stock changed at a location: the product is read again as a whole. */
  async syncInventoryItem(workspaceId: string, inventoryItemId: string) {
    const context = await this.context(workspaceId)
    if (!context) {
      return
    }
    const productId = await getShopifyInventoryItemProductId(
      context.credentials,
      inventoryItemId,
    )
    if (productId) {
      await this.syncProduct(workspaceId, productId)
    }
  }

  async syncDiscount(workspaceId: string, discountId: string) {
    const context = await this.context(workspaceId)
    if (!context) {
      return
    }
    const node = await getShopifyCodeDiscount(context.credentials, discountId)
    const saved = node ? await this.saveDiscount(context, node) : false
    if (!saved) {
      await shopifyRepository.deleteDiscountByExternalId({
        workspaceId,
        externalId: discountId,
      })
    }
  }

  async deleteDiscount(workspaceId: string, discountId: string) {
    await shopifyRepository.deleteDiscountByExternalId({
      workspaceId,
      externalId: discountId,
    })
  }

  async syncOrder(workspaceId: string, orderId: string) {
    const context = await this.context(workspaceId)
    if (!context) {
      return
    }
    const order = await getShopifyOrder(context.credentials, orderId)
    if (order) {
      // Only a store that sells through Shopify tells customers and fires
      // its triggers; one still on its own catalog just keeps the mirror.
      const announce =
        (await ecommerceSettingsService.storeSource(workspaceId)) === "shopify"
      await this.mirrorOrder(context.row, order, { announce })
    }
  }

  /**
   * Writes one Shopify order through `orderService.syncExternal`, linked to
   * the contact who checked out from a shop link when it can be told.
   * `announce` is off for history a full sync pulls in, so old orders send
   * no messages and fire no triggers.
   */
  async mirrorOrder(
    row: IntegrationShopifyModel,
    order: ShopifyOrder,
    options: { announce: boolean },
  ) {
    const state = mapShopifyOrderState(order)
    const contact = await this.resolveContact(row.workspaceId, order)
    const items = await this.mapOrderItems(row.workspaceId, order)
    const money = (set: { shopMoney: { amount: number } } | null) =>
      roundMoney(set?.shopMoney.amount ?? 0, order.currencyCode)
    const subtotal = money(order.subtotalPriceSet)
    const discountTotal = money(order.totalDiscountsSet)

    const result = await orderService.syncExternal({
      workspaceId: row.workspaceId,
      externalId: order.id,
      announce: options.announce,
      status: state.status,
      nextStatus: nextMirroredStatus,
      values: {
        externalName: order.name,
        contactId: contact?.contactId ?? null,
        contactInboxId: contact?.contactInboxId ?? null,
        conversationId: contact?.conversationId ?? null,
        inboxId: null,
        channel: null,
        paymentMethod: "cod",
        paymentStatus: state.paymentStatus,
        paidAt: state.paymentStatus === "paid" ? new Date() : null,
        fulfillmentStatus: state.fulfillmentStatus,
        trackingCompany: state.tracking.company,
        trackingNumber: state.tracking.number,
        trackingUrl: state.tracking.url,
        currency: order.currencyCode,
        subtotal,
        discountTotal,
        couponDiscount: 0,
        shippingTotal: money(order.totalShippingPriceSet),
        serviceFeeTotal: 0,
        taxTotal: money(order.totalTaxSet),
        total: money(order.totalPriceSet),
        discountCodeId: null,
        discountCode: order.discountCodes[0] ?? null,
        customerName:
          order.customer?.displayName ?? order.shippingAddress?.name ?? null,
        customerEmail: order.email ?? order.customer?.email ?? null,
        customerPhone:
          order.phone ??
          order.customer?.phone ??
          order.shippingAddress?.phone ??
          null,
        shippingType: order.shippingAddress ? "delivery" : null,
        shippingAddress: mapShopifyAddress(order.shippingAddress),
        note: order.note,
        cancelReason: order.cancelReason,
        createdAt: new Date(order.createdAt),
      },
      items,
    })
    if (result.created && contact?.fromShopLink) {
      await this.removeOrderedFromCart(row.workspaceId, contact, items)
    }
    return result
  }

  /**
   * A customer who checked out on Shopify from our shop link: what they
   * ordered leaves their cart, as it does for an order placed here.
   */
  private async removeOrderedFromCart(
    workspaceId: string,
    contact: { contactId: string; contactInboxId: string | null },
    items: OrderItemInsertValues[],
  ) {
    const ordered = new Set(
      items.map((item) => `${item.productId}\u0000${item.variantId ?? ""}`),
    )
    try {
      await db.transaction(async (tx) => {
        const cart = await cartRepository.findForUpdate(
          { workspaceId, contactId: contact.contactId },
          tx,
        )
        if (!cart) {
          return
        }
        const left = cart.items.filter(
          (line) =>
            !ordered.has(`${line.productId}\u0000${line.variantId ?? ""}`),
        )
        if (left.length === cart.items.length) {
          return
        }
        await cartRepository.upsert(
          {
            workspaceId,
            contactId: contact.contactId,
            contactInboxId: contact.contactInboxId,
            items: left,
          },
          tx,
        )
      })
    } catch (err) {
      logger.warn(
        { err, workspaceId, contactId: contact.contactId },
        "[shopify] could not empty the cart of a Shopify order",
      )
    }
  }

  // ─── Full sync steps ───────────────────────────────────────────────────

  private async syncCatalog(context: SyncContext) {
    const keep: string[] = []
    let after: string | null = null
    do {
      const page: Awaited<ReturnType<typeof listShopifyProducts>> =
        await listShopifyProducts(context.credentials, after)
      for (const product of page.nodes) {
        await this.saveProduct(context, product)
        keep.push(product.id)
      }
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
    } while (after)
    // Only after every page was read, so a failed page deletes nothing.
    await shopifyRepository.deleteProductsNotIn({
      workspaceId: context.row.workspaceId,
      keepExternalIds: keep,
    })
  }

  private async syncDiscounts(context: SyncContext) {
    const keep: string[] = []
    let after: string | null = null
    do {
      const page: Awaited<ReturnType<typeof listShopifyCodeDiscounts>> =
        await listShopifyCodeDiscounts(context.credentials, after)
      for (const node of page.nodes) {
        if (await this.saveDiscount(context, node)) {
          keep.push(node.id)
        }
      }
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
    } while (after)
    await shopifyRepository.deleteDiscountsNotIn({
      workspaceId: context.row.workspaceId,
      keepExternalIds: keep,
    })
  }

  private async syncOrders(context: SyncContext): Promise<number> {
    const createdAfter = new Date(
      Date.now() - SHOPIFY_ORDER_SYNC_DAYS * 24 * 60 * 60 * 1000,
    )
    let count = 0
    let after: string | null = null
    do {
      const page: Awaited<ReturnType<typeof listShopifyOrders>> =
        await listShopifyOrders(context.credentials, {
          after,
          createdAfter,
        })
      for (const order of page.nodes) {
        try {
          await this.mirrorOrder(context.row, order, { announce: false })
          count++
        } catch (err) {
          // One bad order must not stop the rest of the history.
          logger.warn(
            { err, workspaceId: context.row.workspaceId, orderId: order.id },
            "[shopify] could not mirror an order",
          )
        }
      }
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
    } while (after)
    return count
  }

  // ─── Writers ───────────────────────────────────────────────────────────

  private async saveProduct(context: SyncContext, product: ShopifyProduct) {
    const { workspaceId } = context.row
    const mapped = mapShopifyProduct(product, {
      shopDomain: context.row.shopDomain,
      currency: context.row.currency,
    })
    const categoryId = mapped.categoryName
      ? ((
          await productCategoryRepository.createMissingByName({
            workspaceId,
            names: [mapped.categoryName],
            source: "shopify",
          })
        )[0]?.id ?? null)
      : null
    let vendorId: string | null = null
    if (mapped.vendorName) {
      await vendorRepository.createMissing({
        workspaceId,
        names: [mapped.vendorName],
        source: "shopify",
      })
      vendorId =
        (
          await vendorRepository.findByNames({
            workspaceId,
            names: [mapped.vendorName],
            source: "shopify",
          })
        )[0]?.id ?? null
    }
    await shopifyRepository.upsertProduct({
      workspaceId,
      externalId: mapped.externalId,
      values: { ...mapped.values, categoryId, vendorId },
      options: mapped.options,
      variants: mapped.variants,
    })
  }

  /** False when Shopify's code cannot be priced in our cart. */
  private async saveDiscount(
    context: SyncContext,
    node: Parameters<typeof mapShopifyDiscount>[0],
  ): Promise<boolean> {
    const mapped = mapShopifyDiscount(node)
    if (!mapped) {
      return false
    }
    const { workspaceId } = context.row
    let productIds: string[] = []
    if (mapped.appliesTo === "products") {
      const products = await shopifyRepository.findProductsByExternalIds({
        workspaceId,
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
    await shopifyRepository.upsertDiscount({
      workspaceId,
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
    order: ShopifyOrder,
  ): Promise<OrderItemInsertValues[]> {
    const lines = order.lineItems.nodes
    const variants = await shopifyRepository.findVariantsByExternalIds({
      workspaceId,
      externalIds: lines.flatMap((line) =>
        line.variant ? [line.variant.id] : [],
      ),
    })
    const byVariant = new Map(
      variants.map((variant) => [variant.externalId, variant]),
    )
    const products = await shopifyRepository.findProductsByExternalIds({
      workspaceId,
      externalIds: lines.flatMap((line) =>
        line.product ? [line.product.id] : [],
      ),
    })
    const byProduct = new Map(
      products.map((product) => [product.externalId, product]),
    )

    return lines.map((line) => {
      const variant = line.variant ? byVariant.get(line.variant.id) : undefined
      const product = line.product ? byProduct.get(line.product.id) : undefined
      const unitPrice = roundMoney(
        line.originalUnitPriceSet.shopMoney.amount,
        order.currencyCode,
      )
      const gross = unitPrice * line.quantity
      const lineDiscount = line.totalDiscountSet.shopMoney.amount
      return {
        productId: variant?.productId ?? product?.id ?? null,
        variantId: variant?.variantId ?? null,
        vendorId: variant?.vendorId ?? product?.vendorId ?? null,
        categoryId: variant?.categoryId ?? product?.categoryId ?? null,
        name: line.title,
        variantLabel:
          variantLabelOf(variant?.combination ?? null) ?? line.variantTitle,
        combination: variant?.combination ?? null,
        sku: line.sku,
        retailerId: null,
        imageUrl: line.image?.url ?? null,
        vendorName: null,
        unitPrice,
        quantity: line.quantity,
        stockTaken: 0,
        discountPercent:
          gross > 0 ? roundMoney((lineDiscount / gross) * 100, "USD") : 0,
        taxPercent: 0,
        discountTotal: roundMoney(lineDiscount, order.currencyCode),
        taxTotal: 0,
        lineTotal: roundMoney(gross - lineDiscount, order.currencyCode),
      }
    })
  }

  /**
   * The contact behind a Shopify order: the signed shop token our checkout
   * stamps on it, or else a contact with exactly the order's email or phone.
   * An order placed on the storefront by someone we never talked to has none.
   */
  private async resolveContact(workspaceId: string, order: ShopifyOrder) {
    const ref = order.customAttributes.find(
      (attribute) => attribute.key === SHOPIFY_CONTACT_ATTRIBUTE,
    )?.value
    if (ref) {
      try {
        const payload = await verifyShopToken(ref)
        if (
          payload.mode === "customer" &&
          payload.workspaceId === workspaceId
        ) {
          return {
            contactId: payload.contactId,
            contactInboxId: payload.contactInboxId,
            conversationId: payload.conversationId,
            fromShopLink: true,
          }
        }
      } catch {
        // A forged or expired reference falls back to email and phone.
      }
    }
    for (const identifier of shopifyOrderContactIdentifiers(order)) {
      try {
        const contactId = await contactService.resolveIdByIdentifier({
          workspaceId,
          identifier,
        })
        return {
          contactId,
          contactInboxId: null,
          conversationId: null,
          fromShopLink: false,
        }
      } catch {
        // Not a contact of this workspace.
      }
    }
    return null
  }

  private async context(workspaceId: string): Promise<SyncContext | null> {
    const row = await shopifyRepository.findIntegration(workspaceId)
    if (row?.status !== "active") {
      return null
    }
    return { row, credentials: await resolveShopifyCredentials(row) }
  }
}

export const shopifySyncService = new ShopifySyncService()
