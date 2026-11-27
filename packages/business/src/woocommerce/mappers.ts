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
  WooCommerceAddress,
  WooCommerceCoupon,
  WooCommerceOrder,
  WooCommerceProduct,
  WooCommerceVariation,
} from "@chatbotx.io/integration-woocommerce"
import { normalizePhoneToE164 } from "../contact/phone"

const SHORT_DESCRIPTION_LENGTH = 300
const HTML_TAGS = /<[^>]*>/g
const BLOCK_BREAKS = /<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi
const BLANK_LINES = /\n{3,}/g
const SPACES = /[ \t]+/g
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&#8211;": "–",
  "&#8212;": "—",
  "&#8217;": "’",
  "&#8220;": "“",
  "&#8221;": "”",
}
const ENTITY = /&(?:[a-z]+|#\d+);/gi

/** WooCommerce descriptions are HTML; ours are plain text. */
export const htmlToPlainText = (html: string) =>
  html
    .replace(BLOCK_BREAKS, "\n")
    .replace(HTML_TAGS, "")
    .replace(ENTITY, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(SPACES, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(BLANK_LINES, "\n\n")
    .trim()

/** WooCommerce's default category, which every product without one gets. */
const UNCATEGORIZED_SLUG = "uncategorized"

/**
 * WooCommerce's product status as ours:
 * - published and visible in the shop → `active`;
 * - published but hidden from the catalog, or private → `unlisted`;
 * - draft, pending review, scheduled (and any status a plugin adds) → `draft`.
 */
export const mapWooCommerceProductStatus = (
  product: Pick<WooCommerceProduct, "status" | "catalog_visibility">,
): ProductStatus => {
  if (product.status === "publish") {
    return product.catalog_visibility === "hidden" ? "unlisted" : "active"
  }
  if (product.status === "private") {
    return "unlisted"
  }
  return "draft"
}

/** Only these product types can be put in a cart and ordered. */
export const isOrderableWooCommerceProduct = (product: WooCommerceProduct) =>
  product.type === "simple" || product.type === "variable"

/**
 * Stock as we keep it: `null` is "not counted". A product or variation that
 * does not count stock but is marked out of stock counts as 0, so it is not
 * sold here either.
 */
const stockOf = (item: {
  manage_stock?: boolean | "parent"
  stock_quantity: number | null
  stock_status: string
}): number | null => {
  if (item.manage_stock === true) {
    return Math.max(0, Math.floor(item.stock_quantity ?? 0))
  }
  return item.stock_status === "outofstock" ? 0 : null
}

/** The separator between a variation id and its "Any …" expansion. */
export const ANY_VARIANT_SEPARATOR = "~"

/** The WooCommerce variation id behind one of our variant ids. */
export const wooCommerceVariationIdOf = (externalId: string) =>
  externalId.split(ANY_VARIANT_SEPARATOR)[0] as string

/**
 * The "Any …" attributes one of our variant ids picks, e.g. `55~Size=M` →
 * `[{ name: "Size", value: "M" }]`; empty for a variation sold as is.
 */
export const wooCommerceAnyAttributesOf = (
  externalId: string,
): Array<{ name: string; value: string }> => {
  const separator = externalId.indexOf(ANY_VARIANT_SEPARATOR)
  if (separator < 0) {
    return []
  }
  return [
    ...new URLSearchParams(externalId.slice(separator + 1)).entries(),
  ].map(([name, value]) => ({ name, value }))
}

/**
 * Our variant id for a variation sold with these "Any …" choices. Keyed by
 * the choices themselves (sorted by attribute), not by their position, so a
 * value added to an attribute later does not move an existing variant onto
 * another combination.
 */
const anyVariantExternalId = (
  variationId: number,
  choices: [string, string][],
) =>
  `${variationId}${ANY_VARIANT_SEPARATOR}${new URLSearchParams(
    [...choices].sort(([left], [right]) => left.localeCompare(right)),
  ).toString()}`

/**
 * One of our variants per combination a variation sells. A WooCommerce
 * variation may leave an attribute on "Any …": it is expanded to one variant
 * per value, each keeping the variation id before `~` (and the values it
 * picks after it) so it orders the same variation with those choices.
 */
const expandVariation = (
  variation: WooCommerceVariation,
  options: Array<{ name: string; values: string[] }>,
): Array<{ externalId: string; combination: Record<string, string> }> => {
  const set = new Map(
    variation.attributes.map((attribute) => [attribute.name, attribute.option]),
  )
  const anyOptions = options.filter((option) => !set.get(option.name))
  let combinations: Record<string, string>[] = [{}]
  for (const option of options) {
    const chosen = set.get(option.name)
    const values = chosen ? [chosen] : option.values
    combinations = combinations.flatMap((combination) =>
      values.map((value) => ({ ...combination, [option.name]: value })),
    )
  }
  return combinations.map((combination) => ({
    externalId:
      anyOptions.length > 0
        ? anyVariantExternalId(
            variation.id,
            anyOptions.map((option) => [
              option.name,
              combination[option.name] as string,
            ]),
          )
        : String(variation.id),
    combination,
  }))
}

export type MappedWooCommerceProduct = {
  externalId: string
  values: Omit<ExternalProductValues, "categoryId" | "vendorId">
  options: Array<{ name: string; values: string[]; position: number }>
  variants: ExternalVariantValues[]
  categoryName: string | null
  vendorName: string | null
}

/**
 * A WooCommerce product as our product: its first category (other than
 * "Uncategorized") is the category and its first brand the vendor, matched
 * by name. A simple product keeps no variants; it is ordered by its own id,
 * kept as `externalVariantId`. A variable product's variation attributes are
 * its options and each variation a variant.
 */
export const mapWooCommerceProduct = (
  product: WooCommerceProduct,
  variations: WooCommerceVariation[],
  store: { currency: string },
): MappedWooCommerceProduct => {
  const isVariable = product.type === "variable"
  const options = isVariable
    ? product.attributes
        .filter((attribute) => attribute.variation)
        .sort((left, right) => left.position - right.position)
        .map((attribute, index) => ({
          name: attribute.name,
          values: attribute.options,
          position: index,
        }))
    : []
  const variants: ExternalVariantValues[] = isVariable
    ? variations.flatMap((variation) =>
        expandVariation(variation, options).map((expanded) => ({
          externalId: expanded.externalId,
          externalInventoryItemId: null,
          combination: expanded.combination,
          price: variation.price,
          sku: variation.sku || null,
          inventoryQuantity: stockOf(variation),
          isEnabled: variation.status === "publish",
        })),
      )
    : []
  const enabledPrices = variants
    .filter((variant) => variant.isEnabled)
    .map((variant) => variant.price)
  const description = htmlToPlainText(product.description)
  const shortDescription =
    htmlToPlainText(product.short_description) || description
  const stock = stockOf(product)
  const category = product.categories.find(
    (term) => term.slug !== UNCATEGORIZED_SLUG,
  )

  return {
    externalId: String(product.id),
    categoryName: category?.name.trim() || null,
    vendorName: product.brands[0]?.name.trim() || null,
    values: {
      name: product.name,
      shortDescription:
        shortDescription.length > SHORT_DESCRIPTION_LENGTH
          ? `${shortDescription.slice(0, SHORT_DESCRIPTION_LENGTH - 1).trimEnd()}…`
          : shortDescription || null,
      longDescription: description || null,
      price:
        enabledPrices.length > 0 ? Math.min(...enabledPrices) : product.price,
      currency: store.currency,
      productUrl: product.permalink || null,
      sku: product.sku || null,
      inventoryPolicy: stock === null ? "dont_track" : "track",
      inventoryQuantity: stock ?? 0,
      allowOutOfStockPurchase:
        product.manage_stock === true && product.backorders !== "no",
      images: product.images.map((image) => ({
        url: image.src,
        type: "link" as const,
      })),
      tags: product.tags.map((tag) => tag.name).filter(Boolean),
      status: mapWooCommerceProductStatus(product),
      externalHandle: product.slug || null,
      externalVariantId: isVariable ? null : String(product.id),
    },
    options,
    variants,
  }
}

export type MappedWooCommerceDiscount = {
  externalId: string
  code: string
  discountType: DiscountType
  discountValue: number
  appliesTo: DiscountAppliesTo
  /** WooCommerce product ids, with `appliesTo: products`. */
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

/** A GMT date WooCommerce sends without a zone, e.g. `2026-11-08T10:00:00`. */
export const gmtDate = (value: string | null) =>
  value ? new Date(value.endsWith("Z") ? value : `${value}Z`) : null

/**
 * A WooCommerce coupon as our discount code, or null when our cart could not
 * price it the way WooCommerce will: per-product fixed amounts, category or
 * email limits, exclusions, sale-item rules or a maximum spend. Such a coupon
 * still works when typed on the store's own checkout.
 */
export const mapWooCommerceCoupon = (
  coupon: WooCommerceCoupon,
): MappedWooCommerceDiscount | null => {
  const code = coupon.code.trim()
  if (!code || coupon.status !== "publish") {
    return null
  }
  if (
    coupon.discount_type === "fixed_product" ||
    coupon.product_categories.length > 0 ||
    coupon.excluded_product_categories.length > 0 ||
    coupon.excluded_product_ids.length > 0 ||
    coupon.email_restrictions.length > 0 ||
    coupon.exclude_sale_items ||
    coupon.maximum_amount > 0
  ) {
    return null
  }

  let discountType: DiscountType
  let discountValue = coupon.amount
  if (coupon.amount <= 0 && coupon.free_shipping) {
    discountType = "freeShipping"
    discountValue = 0
  } else if (coupon.discount_type === "percent") {
    discountType = "percentage"
  } else if (coupon.discount_type === "fixed_cart") {
    discountType = "fixedAmount"
  } else {
    return null
  }
  if (discountType !== "freeShipping" && discountValue <= 0) {
    return null
  }

  const usageLimit =
    coupon.usage_limit && coupon.usage_limit > 0
      ? Math.floor(coupon.usage_limit)
      : null
  const used = Math.max(0, Math.floor(coupon.usage_count ?? 0))
  const productExternalIds = coupon.product_ids.map(String)
  return {
    externalId: String(coupon.id),
    code,
    discountType,
    discountValue,
    appliesTo: productExternalIds.length > 0 ? "products" : "entireOrder",
    productExternalIds,
    minimumType: coupon.minimum_amount > 0 ? "amount" : "none",
    minimumValue: coupon.minimum_amount,
    usageLimit,
    // Our check constraint keeps the count within the limit.
    usedCount: usageLimit === null ? used : Math.min(used, usageLimit),
    oncePerCustomer: coupon.usage_limit_per_user === 1,
    startsAt: gmtDate(coupon.date_created_gmt) ?? new Date(0),
    endsAt: gmtDate(coupon.date_expires_gmt),
    isActive: true,
  }
}

/** Plugins add order statuses; anything we do not know stays `pending`. */
const STATUS_BY_WOOCOMMERCE: Record<string, OrderStatus> = {
  pending: "pending",
  "on-hold": "pending",
  processing: "accepted",
  completed: "concluded",
  refunded: "accepted",
  cancelled: "cancelled",
  failed: "cancelled",
}

/**
 * Where a WooCommerce order stands, in our terms:
 * - pending payment or on hold → `pending`;
 * - processing (paid, or cash on delivery accepted) → `accepted`;
 * - completed → `concluded`, fulfilled and paid;
 * - cancelled or failed → `cancelled`;
 * - refunded → `accepted` with the payment `refunded` (statuses never step
 *   back, so a concluded order stays concluded).
 * WooCommerce has no "shipped" of its own; tracking comes from the Shipment
 * Tracking extension's order meta when the store uses it.
 */
export const mapWooCommerceOrderState = (
  order: WooCommerceOrder,
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
  const status = STATUS_BY_WOOCOMMERCE[order.status] ?? "pending"
  let paymentStatus: PaymentStatus = "unpaid"
  if (order.status === "refunded") {
    paymentStatus = "refunded"
  } else if (order.date_paid_gmt || order.status === "completed") {
    paymentStatus = "paid"
  }
  const fulfillmentStatus: FulfillmentStatus =
    order.status === "completed" ? "fulfilled" : "unfulfilled"
  return {
    status,
    paymentStatus,
    fulfillmentStatus,
    tracking: shipmentTrackingOf(order),
  }
}

const trackingItemSchemaKeys = {
  provider: ["tracking_provider", "custom_tracking_provider"],
  number: "tracking_number",
  url: "custom_tracking_link",
} as const

/** The Shipment Tracking extension's first tracking item, when present. */
const shipmentTrackingOf = (order: WooCommerceOrder) => {
  const items = order.meta_data.find(
    (meta) => meta.key === "_wc_shipment_tracking_items",
  )?.value
  const first = Array.isArray(items)
    ? (items[0] as Record<string, unknown> | undefined)
    : undefined
  const read = (key: string) => {
    const value = first?.[key]
    return typeof value === "string" && value.trim() ? value.trim() : null
  }
  return {
    company:
      trackingItemSchemaKeys.provider
        .map((key) => read(key))
        .find((value) => value !== null) ?? null,
    number: read(trackingItemSchemaKeys.number),
    url: read(trackingItemSchemaKeys.url),
  }
}

const HTTPS_PREFIX = /^https:\/\//

/**
 * Our `externalId` of a WooCommerce order: the site and the order id
 * (`example.com#1234`). WooCommerce numbers orders per site, so the id alone
 * would match an order of a site connected earlier.
 */
export const wooCommerceOrderExternalId = (
  siteUrl: string,
  orderId: number | string,
) => `${siteUrl.replace(HTTPS_PREFIX, "")}#${orderId}`

/** WooCommerce's order id inside our `externalId`. */
export const wooCommerceOrderIdOf = (externalId: string) =>
  externalId.slice(externalId.lastIndexOf("#") + 1)

/** Orders WooCommerce keeps that are not orders yet (or any more). */
export const isMirrorableWooCommerceOrder = (order: WooCommerceOrder) =>
  order.status !== "checkout-draft" && order.status !== "trash"

/** A WooCommerce address in our order's shape. */
export const mapWooCommerceAddress = (
  address: WooCommerceAddress,
): OrderShippingAddress | null =>
  address.address_1 || address.city
    ? {
        line1: address.address_1 || null,
        line2: address.address_2 || null,
        city: address.city || null,
        state: address.state || null,
        zip: address.postcode || null,
        country: address.country || null,
      }
    : null

/** "Nguyen Van A" from WooCommerce's first and last name fields. */
export const wooCommerceCustomerName = (order: WooCommerceOrder) => {
  for (const address of [order.billing, order.shipping]) {
    const name = [address.first_name, address.last_name]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ")
    if (name) {
      return name
    }
  }
  return null
}

/** The value of one of the order's meta entries, when it is text. */
export const wooCommerceOrderMeta = (order: WooCommerceOrder, key: string) => {
  const value = order.meta_data.find((meta) => meta.key === key)?.value
  return typeof value === "string" && value ? value : null
}

/**
 * The contact identifiers to look a WooCommerce customer up by, email first.
 * Contacts keep their phone in E.164 (`+84901234567`) and are matched
 * exactly, so the order's phone is normalized the same way.
 */
export const wooCommerceOrderContactIdentifiers = (
  order: Pick<WooCommerceOrder, "billing" | "shipping">,
): string[] => {
  const email = order.billing.email.trim()
  const rawPhone = order.billing.phone.trim() || order.shipping.phone.trim()
  const phone = rawPhone
    ? normalizePhoneToE164(
        rawPhone,
        order.billing.country || order.shipping.country || undefined,
      )
    : null
  return [
    ...(email ? [`email:${email.toLowerCase()}`] : []),
    ...(phone ? [`phone:${phone}`] : []),
  ]
}
