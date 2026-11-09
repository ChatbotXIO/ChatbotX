import type {
  DiscountAppliesTo,
  DiscountMinimumType,
  DiscountType,
  FulfillmentStatus,
  OrderShippingAddress,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
} from "@chatbotx.io/database/partials"
import type {
  ExternalProductValues,
  ExternalVariantValues,
} from "@chatbotx.io/database/repositories"
import type {
  ShopifyCodeDiscount,
  ShopifyOrder,
  ShopifyProduct,
} from "@chatbotx.io/integration-shopify"
import { normalizePhoneToE164 } from "../contact/phone"

export {
  nextMirroredStatus,
  splitCustomerName,
} from "../external-store/orders"

const SHORT_DESCRIPTION_LENGTH = 300

/** Shopify's placeholder option for a product sold without options. */
const isDefaultOnlyOptions = (product: ShopifyProduct) =>
  product.options.length === 1 &&
  product.options[0]?.name === "Title" &&
  product.options[0].optionValues.length === 1 &&
  product.options[0].optionValues[0]?.name === "Default Title"

/**
 * Shopify's product status as ours. `ARCHIVED`, and any status Shopify adds
 * later, is not sold: it lands as `draft`.
 */
export const mapShopifyProductStatus = (status: string): ProductStatus => {
  if (status === "ACTIVE") {
    return "active"
  }
  if (status === "UNLISTED") {
    return "unlisted"
  }
  return "draft"
}

export type MappedShopifyProduct = {
  externalId: string
  values: Omit<ExternalProductValues, "categoryId" | "vendorId">
  options: Array<{ name: string; values: string[]; position: number }>
  variants: ExternalVariantValues[]
  categoryName: string | null
  vendorName: string | null
}

/**
 * A Shopify product as our product. Product type is the category and the
 * vendor is the vendor, matched by name. A product sold without options keeps
 * no variants here; its one Shopify variant is `externalVariantId`.
 */
export const mapShopifyProduct = (
  product: ShopifyProduct,
  store: { shopDomain: string; currency: string },
): MappedShopifyProduct => {
  const variants = product.variants.nodes
  const first = variants[0]
  const withoutOptions = isDefaultOnlyOptions(product)
  const description = product.description.trim()

  return {
    externalId: product.id,
    categoryName: product.productType.trim() || null,
    vendorName: product.vendor.trim() || null,
    values: {
      name: product.title,
      shortDescription:
        description.length > SHORT_DESCRIPTION_LENGTH
          ? `${description.slice(0, SHORT_DESCRIPTION_LENGTH - 1).trimEnd()}…`
          : description || null,
      longDescription: description || null,
      price: first?.price ?? 0,
      currency: store.currency,
      productUrl:
        product.onlineStoreUrl ??
        `https://${store.shopDomain}/products/${product.handle}`,
      sku: first?.sku || null,
      inventoryPolicy: product.tracksInventory ? "track" : "dont_track",
      inventoryQuantity: Math.max(0, product.totalInventory ?? 0),
      allowOutOfStockPurchase: false,
      images: product.media.nodes.flatMap((media) =>
        media.image?.url
          ? [{ url: media.image.url, type: "link" as const }]
          : [],
      ),
      tags: product.tags,
      status: mapShopifyProductStatus(product.status),
      externalHandle: product.handle,
      externalVariantId: withoutOptions ? (first?.id ?? null) : null,
    },
    options: withoutOptions
      ? []
      : product.options.map((option) => ({
          name: option.name,
          values: option.optionValues.map((value) => value.name),
          position: option.position,
        })),
    variants: withoutOptions
      ? []
      : variants.map((variant) => ({
          externalId: variant.id,
          externalInventoryItemId: variant.inventoryItem?.id ?? null,
          combination: Object.fromEntries(
            variant.selectedOptions.map((option) => [
              option.name,
              option.value,
            ]),
          ),
          price: variant.price,
          sku: variant.sku || null,
          inventoryQuantity:
            variant.inventoryItem?.tracked === false
              ? null
              : Math.max(0, variant.inventoryQuantity ?? 0),
          isEnabled: true,
        })),
  }
}

export type MappedShopifyDiscount = {
  externalId: string
  code: string
  discountType: DiscountType
  discountValue: number
  appliesTo: DiscountAppliesTo
  /** Shopify product GIDs, with `appliesTo: products`. */
  productExternalIds: string[]
  minimumType: DiscountMinimumType
  minimumValue: number
  usageLimit: number | null
  usedCount: number
  oncePerCustomer: boolean
  startsAt: Date
  endsAt: Date | null
  isActive: boolean
}

/**
 * A Shopify code discount as our discount code, or null when the cart could
 * not price it the way Shopify will (collections, buy X get Y, apps). Such a
 * code still works when typed on the Shopify checkout page.
 */
export const mapShopifyDiscount = (node: {
  id: string
  codeDiscount: ShopifyCodeDiscount
}): MappedShopifyDiscount | null => {
  const discount = node.codeDiscount
  const code = discount.codes?.nodes[0]?.code
  if (!code) {
    return null
  }

  let discountType: DiscountType
  let discountValue = 0
  let appliesTo: DiscountAppliesTo = "entireOrder"
  let productExternalIds: string[] = []
  if (discount.__typename === "DiscountCodeFreeShipping") {
    discountType = "freeShipping"
  } else if (discount.__typename === "DiscountCodeBasic") {
    const value = discount.customerGets?.value
    if (value?.__typename === "DiscountPercentage") {
      discountType = "percentage"
      // Shopify keeps a fraction, 0.1 for 10%.
      discountValue = Math.round((value.percentage ?? 0) * 10_000) / 100
    } else if (value?.__typename === "DiscountAmount") {
      discountType = "fixedAmount"
      discountValue = value.amount?.amount ?? 0
    } else {
      return null
    }
    const items = discount.customerGets?.items
    if (items?.__typename === "DiscountProducts") {
      appliesTo = "products"
      productExternalIds =
        items.products?.nodes.map((product) => product.id) ?? []
      if (productExternalIds.length === 0) {
        return null
      }
    } else if (!(items?.__typename === "AllDiscountItems" && items.allItems)) {
      return null
    }
  } else {
    return null
  }

  const minimum = discount.minimumRequirement
  let minimumType: DiscountMinimumType = "none"
  let minimumValue = 0
  if (minimum?.__typename === "DiscountMinimumSubtotal") {
    minimumType = "amount"
    minimumValue = minimum.greaterThanOrEqualToSubtotal?.amount ?? 0
  } else if (minimum?.__typename === "DiscountMinimumQuantity") {
    minimumType = "quantity"
    minimumValue = Number.parseInt(
      minimum.greaterThanOrEqualToQuantity ?? "0",
      10,
    )
  }

  const usageLimit = discount.usageLimit ?? null
  const used = discount.asyncUsageCount ?? 0
  return {
    externalId: node.id,
    code,
    discountType,
    discountValue,
    appliesTo,
    productExternalIds,
    minimumType,
    minimumValue,
    usageLimit,
    // Our check constraint keeps the count within the limit.
    usedCount: usageLimit === null ? used : Math.min(used, usageLimit),
    oncePerCustomer: discount.appliesOncePerCustomer ?? false,
    startsAt: discount.startsAt ? new Date(discount.startsAt) : new Date(0),
    endsAt: discount.endsAt ? new Date(discount.endsAt) : null,
    isActive: discount.status !== "EXPIRED",
  }
}

const PAID_FINANCIAL_STATUSES = new Set([
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
])

/**
 * Where a Shopify order stands, in our terms:
 * - cancelled on Shopify → `cancelled`;
 * - a fulfillment delivered → `concluded`;
 * - fulfilled (every item handed to the carrier) → `shipped`;
 * - paid → `accepted`;
 * - otherwise `pending`.
 */
export const mapShopifyOrderState = (
  order: ShopifyOrder,
): {
  status: OrderStatus
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  tracking: {
    company: string | null
    number: string | null
    url: string | null
  }
} => {
  const financial = order.displayFinancialStatus ?? "PENDING"
  let paymentStatus: PaymentStatus = "unpaid"
  if (financial === "REFUNDED") {
    paymentStatus = "refunded"
  } else if (PAID_FINANCIAL_STATUSES.has(financial)) {
    paymentStatus = "paid"
  }

  let fulfillmentStatus: FulfillmentStatus = "unfulfilled"
  if (order.displayFulfillmentStatus === "FULFILLED") {
    fulfillmentStatus = "fulfilled"
  } else if (order.displayFulfillmentStatus === "PARTIALLY_FULFILLED") {
    fulfillmentStatus = "partial"
  }

  const delivered = order.fulfillments.some(
    (fulfillment) => fulfillment.displayStatus === "DELIVERED",
  )
  let status: OrderStatus = "pending"
  if (order.cancelledAt) {
    status = "cancelled"
  } else if (delivered && fulfillmentStatus === "fulfilled") {
    status = "concluded"
  } else if (fulfillmentStatus === "fulfilled") {
    status = "shipped"
  } else if (paymentStatus !== "unpaid") {
    status = "accepted"
  }

  const tracking =
    order.fulfillments.flatMap((fulfillment) => fulfillment.trackingInfo)[0] ??
    null
  return {
    status,
    paymentStatus,
    fulfillmentStatus,
    tracking: {
      company: tracking?.company ?? null,
      number: tracking?.number ?? null,
      url: tracking?.url ?? null,
    },
  }
}

/** A Shopify address in our order's shape. */
export const mapShopifyAddress = (
  address: ShopifyOrder["shippingAddress"],
): OrderShippingAddress | null =>
  address
    ? {
        line1: address.address1,
        line2: address.address2,
        city: address.city,
        state: address.province,
        zip: address.zip,
        country: address.countryCodeV2,
      }
    : null

/**
 * The contact identifiers to look a Shopify customer up by, email first.
 * Contacts keep their phone in E.164 (`+84901234567`) and are matched
 * exactly, so the order's phone is normalized the same way.
 */
export const shopifyOrderContactIdentifiers = (
  order: Pick<ShopifyOrder, "email" | "phone" | "customer" | "shippingAddress">,
): string[] => {
  const email = order.email ?? order.customer?.email
  const rawPhone = order.phone ?? order.customer?.phone
  const phone = rawPhone
    ? normalizePhoneToE164(rawPhone, order.shippingAddress?.countryCodeV2)
    : null
  return [
    ...(email ? [`email:${email.toLowerCase()}`] : []),
    ...(phone ? [`phone:${phone}`] : []),
  ]
}
