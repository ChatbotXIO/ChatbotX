import type { ShopifySyncScope } from "@chatbotx.io/database/partials"
import {
  externalStoreRepository,
  type OrderItemInsertValues,
  productCategoryRepository,
  shopifyRepository,
  vendorRepository,
} from "@chatbotx.io/database/repositories"
import type { IntegrationShopifyModel } from "@chatbotx.io/database/types"
import {
  getShopifyCodeDiscount,
  getShopifyInventoryItemProductId,
  getShopifyOrder,
  getShopifyProduct,
  getShopifyShop,
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
import { ecommerceSettingsService } from "../ecommerce-settings/service"
import { adoptExternalStoreCurrency } from "../ecommerce-settings/store-source"
import {
  EXTERNAL_CONTACT_ATTRIBUTE,
  removeOrderedFromCart,
  resolveExternalOrderContact,
  syncErrorMessage,
  variantLabelOf,
} from "../external-store/orders"
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
export const SHOPIFY_CONTACT_ATTRIBUTE = EXTERNAL_CONTACT_ATTRIBUTE

type SyncContext = {
  row: IntegrationShopifyModel
  credentials: ShopifyCredentials
}

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
      const credentials = await resolveShopifyCredentials(row)
      const context: SyncContext = {
        row: await this.refreshStoreCurrency(row, credentials),
        credentials,
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
          productCount: await externalStoreRepository.countProducts({
            workspaceId: input.workspaceId,
            source: "shopify",
          }),
          orderCount,
          status: "active",
          statusReason: null,
        },
      })
    } catch (error) {
      const message = syncErrorMessage(error)
      await shopifyRepository.updateIntegration({
        workspaceId: input.workspaceId,
        values: { syncStatus: "failed", syncError: message },
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

  /**
   * The store's currency, read again with every sync: products are priced
   * in it, and a store selling from Shopify shows prices and charges orders
   * in it (`payments.currency`). Returns the connection with it.
   */
  private async refreshStoreCurrency(
    row: IntegrationShopifyModel,
    credentials: ShopifyCredentials,
  ): Promise<IntegrationShopifyModel> {
    const shop = await getShopifyShop(credentials)
    const currency = shop.currencyCode.toUpperCase()
    let current = row
    if (currency !== row.currency || shop.name !== row.shopName) {
      current =
        (await shopifyRepository.updateIntegration({
          workspaceId: row.workspaceId,
          values: { currency, shopName: shop.name },
        })) ?? row
    }
    await adoptExternalStoreCurrency({
      workspaceId: row.workspaceId,
      source: "shopify",
      currency,
    })
    return current
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
      await externalStoreRepository.deleteProductByExternalId({
        source: "shopify",
        workspaceId,
        externalId: productId,
      })
    }
    await this.invalidateCacheTags(`products:${workspaceId}`)
  }

  async deleteProduct(workspaceId: string, productId: string) {
    await externalStoreRepository.deleteProductByExternalId({
      source: "shopify",
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
      await externalStoreRepository.deleteDiscountByExternalId({
        source: "shopify",
        workspaceId,
        externalId: discountId,
      })
    }
  }

  async deleteDiscount(workspaceId: string, discountId: string) {
    await externalStoreRepository.deleteDiscountByExternalId({
      source: "shopify",
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
      source: "shopify",
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
    await externalStoreRepository.deleteProductsNotIn({
      source: "shopify",
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
    await externalStoreRepository.deleteDiscountsNotIn({
      source: "shopify",
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
    await externalStoreRepository.upsertProduct({
      source: "shopify",
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
      const products = await externalStoreRepository.findProductsByExternalIds({
        source: "shopify",
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
    await externalStoreRepository.upsertDiscount({
      source: "shopify",
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
    const variants = await externalStoreRepository.findVariantsByExternalIds({
      source: "shopify",
      workspaceId,
      externalIds: lines.flatMap((line) =>
        line.variant ? [line.variant.id] : [],
      ),
    })
    const byVariant = new Map(
      variants.map((variant) => [variant.externalId, variant]),
    )
    const products = await externalStoreRepository.findProductsByExternalIds({
      source: "shopify",
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
   */
  private async resolveContact(workspaceId: string, order: ShopifyOrder) {
    return await resolveExternalOrderContact({
      workspaceId,
      reference:
        order.customAttributes.find(
          (attribute) => attribute.key === SHOPIFY_CONTACT_ATTRIBUTE,
        )?.value ?? null,
      identifiers: shopifyOrderContactIdentifiers(order),
    })
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
