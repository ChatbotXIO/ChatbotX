import type { ExternalStoreSource } from "@chatbotx.io/database/partials"

const TRAILING_DIGITS_PATTERN = /(\d+)$/

/** The numeric id at the end of a Shopify GID, or the input when it has none. */
export const shopifyNumericId = (globalId: string): string =>
  TRAILING_DIGITS_PATTERN.exec(globalId)?.[1] ?? globalId

/**
 * What the products and orders pages need of the connected external store
 * to link into it: which store, a name to show and its admin address.
 */
export type ExternalStoreLinks = {
  source: ExternalStoreSource
  /** The store's name as shown, e.g. `Shopify` or `WooCommerce`. */
  storeName: string
  /** The shop's address: `your-store.myshopify.com`, `https://example.com`. */
  shopLabel: string
  /** Shopify's `/admin`, WordPress's `/wp-admin`. */
  adminUrl: string
}

/** WooCommerce opens products and orders in WordPress's post editor. */
const wooCommerceEditUrl = (adminUrl: string, externalId: string) =>
  `${adminUrl}/post.php?post=${encodeURIComponent(externalId)}&action=edit`

/** The store's product list, for "Open Shopify ↗" style buttons. */
export const externalProductsAdminUrl = (store: ExternalStoreLinks) =>
  store.source === "shopify"
    ? `${store.adminUrl}/products`
    : `${store.adminUrl}/edit.php?post_type=product`

export const externalProductAdminUrl = (input: {
  store: ExternalStoreLinks
  externalId: string | null
}): string => {
  const { store, externalId } = input
  if (!externalId) {
    return externalProductsAdminUrl(store)
  }
  return store.source === "shopify"
    ? `${store.adminUrl}/products/${shopifyNumericId(externalId)}`
    : wooCommerceEditUrl(store.adminUrl, externalId)
}

export const externalOrderAdminUrl = (input: {
  store: ExternalStoreLinks
  externalId: string | null
}): string => {
  const { store, externalId } = input
  if (store.source === "shopify") {
    return externalId
      ? `${store.adminUrl}/orders/${shopifyNumericId(externalId)}`
      : `${store.adminUrl}/orders`
  }
  // A WooCommerce order's `externalId` is `{site}#{orderId}`.
  return externalId
    ? wooCommerceEditUrl(
        store.adminUrl,
        externalId.slice(externalId.lastIndexOf("#") + 1),
      )
    : `${store.adminUrl}/admin.php?page=wc-orders`
}
