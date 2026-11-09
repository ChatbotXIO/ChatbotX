export const WOOCOMMERCE_HTTP_TIMEOUT_MS = 20_000
/** The most WooCommerce's REST API returns in one page. */
export const WOOCOMMERCE_PAGE_SIZE = 100
/**
 * How far back a full sync reads orders: the same window as Shopify's, so a
 * store connects with its recent history and old customers are not touched.
 */
export const WOOCOMMERCE_ORDER_SYNC_DAYS = 60

/** The REST API root of a store, e.g. `https://example.com/wp-json/wc/v3`. */
export const woocommerceApiUrl = (siteUrl: string) => `${siteUrl}/wp-json/wc/v3`

/** The store's WordPress admin pages, for "Open WooCommerce ↗" style links. */
export const woocommerceAdminUrl = (siteUrl: string, path = "") =>
  `${siteUrl}/wp-admin${path}`

/**
 * The edit page of a product or an order. Orders kept in WooCommerce's own
 * tables (HPOS) are redirected there from the legacy post editor.
 */
export const woocommerceEditUrl = (siteUrl: string, id: string | number) =>
  woocommerceAdminUrl(siteUrl, `/post.php?post=${id}&action=edit`)
