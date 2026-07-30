import {
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGES_PER_ITEM,
  MAX_TITLE_LENGTH,
} from "../constants"
import type { MetaCatalogProductData } from "../schemas"

export const SkipReason = {
  missingImage: "missingImage",
  missingDescription: "missingDescription",
  missingStoreUrl: "missingStoreUrl",
  hasVariants: "hasVariants",
} as const
export type SkipReason = (typeof SkipReason)[keyof typeof SkipReason]

const TRAILING_SLASHES_REGEX = /\/+$/

export type CatalogProduct = {
  id: string
  /** Preferred Content ID — see `resolveRetailerIds` for when it is usable. */
  sku?: string | null
  name: string
  shortDescription: string | null
  longDescription: string | null
  price: number
  discount: number
  /** ISO 4217 code. Overrides the catalog-wide currency when set. */
  currency?: string | null
  /** Storefront link. Overrides `${storeUrl}/${id}` when set. */
  productUrl?: string | null
  inventoryPolicy: string
  inventoryQuantity: number
  allowOutOfStockPurchase: boolean
  isActive: boolean
  images: Array<{ url: string; type: "link" | "file" }>
  vendor: string | null
  category?: { name: string } | null
  subcategory?: { name: string } | null
  variants?: readonly unknown[]
}

/** Catalog-wide fallbacks, used only where a product carries no value of its own. */
export type CatalogSettings = {
  currency: string
  storeUrl: string | null
  workspaceName: string
}

const resolveCurrency = (
  product: CatalogProduct,
  settings: CatalogSettings,
): string => product.currency?.trim() || settings.currency

/**
 * Meta reads `product_type` as a taxonomy path, so a product filed under a
 * sub-category travels as "Parent > Child" instead of losing one of its two
 * levels. Either level alone still ships on its own.
 */
const resolveProductType = (product: CatalogProduct): string | undefined => {
  const path = [product.category?.name, product.subcategory?.name]
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name))
  return path.length > 0 ? path.join(" > ") : undefined
}

const resolveProductLink = (
  product: CatalogProduct,
  settings: CatalogSettings,
): string => {
  const productUrl = product.productUrl?.trim()
  if (productUrl) {
    return productUrl
  }
  const storeUrl = settings.storeUrl?.replace(TRAILING_SLASHES_REGEX, "") ?? ""
  return `${storeUrl}/${product.id}`
}

type Availability = MetaCatalogProductData["availability"]

const AVAILABILITY_RULES: ReadonlyArray<{
  when: (product: CatalogProduct) => boolean
  value: Availability
}> = [
  { when: (product) => !product.isActive, value: "discontinued" },
  {
    when: (product) => product.inventoryPolicy === "dont_track",
    value: "available for order",
  },
  {
    when: (product) => product.inventoryQuantity > 0,
    value: "in stock",
  },
  {
    when: (product) => product.allowOutOfStockPurchase,
    value: "available for order",
  },
]
const DEFAULT_AVAILABILITY: Availability = "out of stock"

export const resolveMetaAvailability = (
  product: CatalogProduct,
): Availability =>
  AVAILABILITY_RULES.find((rule) => rule.when(product))?.value ??
  DEFAULT_AVAILABILITY

const stripHtml = (value: string): string =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const formatAmount = (amount: number, currency: string): string => {
  const fractionDigits = currency.toUpperCase() === "VND" ? 0 : 2
  const formattedAmount = Number(amount.toFixed(fractionDigits)).toString()
  return `${formattedAmount} ${currency.toUpperCase()}`
}

const resolveSkipReason = (
  product: CatalogProduct,
  settings: CatalogSettings,
): SkipReason | undefined => {
  const rules: ReadonlyArray<{
    reason: SkipReason
    when: () => boolean
  }> = [
    {
      reason: SkipReason.missingImage,
      when: () => !product.images.some((image) => image.url.trim()),
    },
    {
      reason: SkipReason.missingDescription,
      when: () =>
        !stripHtml(product.shortDescription ?? product.longDescription ?? ""),
    },
    {
      reason: SkipReason.missingStoreUrl,
      when: () => !(product.productUrl?.trim() || settings.storeUrl),
    },
    {
      reason: SkipReason.hasVariants,
      when: () => Boolean(product.variants?.length),
    },
  ]
  return rules.find((rule) => rule.when())?.reason
}

export type MetaItemMapping =
  | { ok: false; productId: string; reason: SkipReason }
  | {
      ok: true
      productId: string
      retailerId: string
      data: MetaCatalogProductData
    }

export const toMetaItem = (
  product: CatalogProduct,
  settings: CatalogSettings,
  retailerId = product.id,
): MetaItemMapping => {
  const reason = resolveSkipReason(product, settings)
  if (reason) {
    return { ok: false, productId: product.id, reason }
  }

  const description = stripHtml(
    product.shortDescription ?? product.longDescription ?? "",
  ).slice(0, MAX_DESCRIPTION_LENGTH)
  const currency = resolveCurrency(product, settings)
  const salePrice =
    product.discount > 0
      ? Math.max(0, product.price * (1 - product.discount / 100))
      : undefined
  const productType = resolveProductType(product)

  return {
    ok: true,
    productId: product.id,
    retailerId,
    data: {
      title: product.name.slice(0, MAX_TITLE_LENGTH),
      description,
      availability: resolveMetaAvailability(product),
      condition: "new",
      image: product.images
        .filter((image) => image.url.trim())
        .slice(0, MAX_IMAGES_PER_ITEM)
        .map((image) => ({ url: image.url, tag: [] })),
      link: resolveProductLink(product, settings),
      price: formatAmount(product.price, currency),
      ...(salePrice === undefined
        ? {}
        : { sale_price: formatAmount(salePrice, currency) }),
      brand: product.vendor?.trim() || settings.workspaceName,
      ...(productType ? { product_type: productType } : {}),
      quantity_to_sell_on_facebook: product.inventoryQuantity,
    },
  }
}
