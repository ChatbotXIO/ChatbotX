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
  price: number
  discount: number
  /** ISO 4217 code as reported by Meta. Absent when the catalog omits it. */
  currency?: string
  /** Storefront link as reported by Meta. */
  productUrl?: string
  shortDescription?: string
  categoryName?: string
  vendor?: string
  inventoryQuantity: number
  inventoryPolicy: "dont_track" | "track"
  images: Array<{ url: string; type: "link" }>
  isActive: boolean
}

export type MetaProductImportMapping =
  | { ok: true; product: ImportedMetaProduct }
  | { ok: false; remoteId?: string; reason: string }

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
  const discount =
    price && salePrice !== undefined && salePrice < price
      ? Math.min(100, Math.max(0, ((price - salePrice) / price) * 100))
      : 0
  const quantity = parseNonNegativeNumber(remote.quantity_to_sell_on_facebook)
  const images = Array.from(
    new Set(
      [remote.image_url, ...(remote.additional_image_urls ?? [])]
        .flatMap((value) => value ?? [])
        .map(normalizeHttpUrl)
        .filter((value): value is string => Boolean(value)),
    ),
  ).map((url) => ({ url, type: "link" as const }))

  return {
    ok: true,
    product: {
      retailerId,
      name,
      sku: retailerId,
      price: price ?? 0,
      discount,
      currency: normalizeOptionalText(remote.currency)?.toUpperCase(),
      productUrl: remote.url ? normalizeHttpUrl(remote.url) : undefined,
      shortDescription: normalizeOptionalText(
        remote.short_description ?? remote.description,
      ),
      categoryName: normalizeOptionalText(remote.product_type),
      vendor: normalizeOptionalText(remote.brand),
      inventoryQuantity: Math.floor(quantity ?? 0),
      inventoryPolicy: quantity === undefined ? "dont_track" : "track",
      images,
      isActive: remote.availability?.toLowerCase() !== "discontinued",
    },
  }
}
