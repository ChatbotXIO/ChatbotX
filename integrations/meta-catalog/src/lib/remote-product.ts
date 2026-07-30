import type { MetaCatalogRemoteProduct } from "../schemas"

const HTTP_PROTOCOLS = new Set(["http:", "https:"])

const normalizeOptionalText = (value: string | undefined) => {
  const normalized = value?.trim()
  return normalized || undefined
}

const parseNonNegativeNumber = (
  value: number | string | undefined,
): number | undefined => {
  if (value === undefined || value === "") {
    return
  }
  const parsed = typeof value === "number" ? value : Number(value.trim())
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

const PRICE_NOISE_REGEX = /[^\d.,]/g
const PRICE_FRACTION_REGEX = /[.,](\d{1,2})$/
const PRICE_GROUPING_REGEX = /[.,]/g

/**
 * Graph returns prices as display strings — "$9.99", "199.000₫", "14,50 EUR" —
 * so drop the currency noise and treat only a trailing one-to-two digit group
 * as the fraction. Anything longer is thousands grouping, which keeps
 * zero-decimal currencies like VND from being divided by a thousand.
 */
const parsePriceAmount = (
  value: number | string | undefined,
): number | undefined => {
  if (typeof value !== "string") {
    return parseNonNegativeNumber(value)
  }
  const digits = value.replace(PRICE_NOISE_REGEX, "")
  const fraction = PRICE_FRACTION_REGEX.exec(digits)
  const whole = (
    fraction ? digits.slice(0, -fraction[0].length) : digits
  ).replace(PRICE_GROUPING_REGEX, "")
  return parseNonNegativeNumber(
    fraction ? `${whole || "0"}.${fraction[1]}` : whole,
  )
}

const normalizeHttpUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value)
    return HTTP_PROTOCOLS.has(url.protocol) ? url.toString() : undefined
  } catch {
    return
  }
}

export type ImportedMetaProduct = {
  retailerId: string
  name: string
  sku: string
  price?: number
  discount?: number
  /** ISO 4217 code as reported by Meta. Absent when the catalog omits it. */
  currency?: string
  /** Storefront link as reported by Meta. */
  productUrl?: string | null
  shortDescription?: string | null
  longDescription?: string | null
  categoryName?: string | null
  subcategoryName?: string | null
  tags?: string[]
  vendor?: string | null
  inventoryQuantity?: number
  inventoryPolicy?: "dont_track" | "track"
  allowOutOfStockPurchase?: boolean
  images?: Array<{ url: string; type: "link" }>
  isActive?: boolean
}

export type MetaProductImportMapping =
  | { ok: true; product: ImportedMetaProduct }
  | { ok: false; remoteId?: string; reason: string }

const collectStrings = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings)
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings)
  }
  return []
}

const parseProductType = (
  value: string | undefined,
): { categoryName: string | null; subcategoryName: string | null } => {
  const parts = value
    ?.split(">")
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts?.length) {
    return { categoryName: null, subcategoryName: null }
  }
  return {
    categoryName: parts[0],
    subcategoryName: parts.length > 1 ? parts.slice(1).join(" > ") : null,
  }
}

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.hasOwn(value, key)

const resolveDiscount = (
  price: number | undefined,
  salePrice: number | undefined,
): number | undefined => {
  if (price === undefined) {
    return
  }
  if (price > 0 && salePrice !== undefined && salePrice < price) {
    return Math.min(100, Math.max(0, ((price - salePrice) / price) * 100))
  }
  return 0
}

const resolveProductUrl = (
  remote: MetaCatalogRemoteProduct,
): string | null | undefined => {
  if (!hasOwn(remote, "url")) {
    return
  }
  const value = remote.url?.trim()
  return value ? normalizeHttpUrl(value) : null
}

const resolveInventoryPatch = (
  quantity: number | undefined,
  availability: string | undefined,
): Pick<
  ImportedMetaProduct,
  "inventoryQuantity" | "inventoryPolicy" | "allowOutOfStockPurchase"
> => {
  if (quantity === undefined) {
    return {}
  }
  if (
    quantity === 0 &&
    (availability === "available for order" || availability === "discontinued")
  ) {
    // Available-for-order can mean untracked inventory or tracked backorders.
    // Discontinued describes the active state, not the inventory policy. In
    // both cases only the quantity is known, so preserve the local policy.
    return { inventoryQuantity: 0 }
  }
  return {
    inventoryQuantity: Math.floor(quantity),
    inventoryPolicy: "track",
    allowOutOfStockPurchase: false,
  }
}

export const toImportedMetaProduct = (
  remote: MetaCatalogRemoteProduct,
): MetaProductImportMapping => {
  const retailerId = normalizeOptionalText(remote.retailer_id)
  const name = normalizeOptionalText(remote.name)
  if (!retailerId) {
    return {
      ok: false,
      remoteId: normalizeOptionalText(remote.id),
      reason: "Meta product is missing retailer_id",
    }
  }
  if (!name) {
    return {
      ok: false,
      remoteId: retailerId,
      reason: "Meta product is missing name",
    }
  }

  const price = parsePriceAmount(remote.price)
  if (remote.price !== undefined && price === undefined) {
    return {
      ok: false,
      remoteId: retailerId,
      reason: "Meta product price is invalid",
    }
  }
  const salePrice = parsePriceAmount(remote.sale_price)
  const hasSalePrice =
    remote.sale_price !== undefined &&
    !(typeof remote.sale_price === "string" && remote.sale_price.trim() === "")
  if (hasSalePrice && salePrice === undefined) {
    return {
      ok: false,
      remoteId: retailerId,
      reason: "Meta product sale price is invalid",
    }
  }
  const discount = resolveDiscount(price, salePrice)
  const quantity = parseNonNegativeNumber(remote.quantity_to_sell_on_facebook)
  const originalImages = Array.from(
    new Set(
      [remote.image_url, remote.additional_image_urls, remote.images]
        .flatMap(collectStrings)
        .map(normalizeHttpUrl)
        .filter((value): value is string => Boolean(value)),
    ),
  )
  const cdnImages = Array.from(
    new Set(
      [remote.image_cdn_urls, remote.additional_image_cdn_urls]
        .flatMap(collectStrings)
        .map(normalizeHttpUrl)
        .filter((value): value is string => Boolean(value)),
    ),
  )
  const images = (originalImages.length > 0 ? originalImages : cdnImages).map(
    (url) => ({ url, type: "link" as const }),
  )
  const customLabels = [
    remote.custom_label_0,
    remote.custom_label_1,
    remote.custom_label_2,
    remote.custom_label_3,
    remote.custom_label_4,
  ]
  const tags = Array.from(
    new Set(
      customLabels
        .map(normalizeOptionalText)
        .filter((value): value is string => Boolean(value)),
    ),
  )
  const availability = remote.availability?.trim().toLowerCase()
  const categoryPath = hasOwn(remote, "product_type")
    ? parseProductType(remote.product_type)
    : undefined
  const productUrl = resolveProductUrl(remote)

  return {
    ok: true,
    product: {
      retailerId,
      name,
      sku: retailerId,
      ...(price === undefined ? {} : { price, discount: discount ?? 0 }),
      currency: normalizeOptionalText(remote.currency)?.toUpperCase(),
      ...(productUrl === undefined ? {} : { productUrl }),
      ...(hasOwn(remote, "short_description")
        ? {
            shortDescription:
              normalizeOptionalText(remote.short_description) ?? null,
          }
        : {}),
      ...(hasOwn(remote, "description")
        ? {
            longDescription: normalizeOptionalText(remote.description) ?? null,
          }
        : {}),
      ...(categoryPath ?? {}),
      ...(customLabels.some((label) => label !== undefined) ? { tags } : {}),
      ...(hasOwn(remote, "brand")
        ? { vendor: normalizeOptionalText(remote.brand) ?? null }
        : {}),
      ...resolveInventoryPatch(quantity, availability),
      ...(images.length > 0 ? { images } : {}),
      ...(availability ? { isActive: availability !== "discontinued" } : {}),
    },
  }
}
