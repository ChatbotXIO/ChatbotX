/** The Admin API version every call is pinned to. */
export const SHOPIFY_API_VERSION = "2026-07"
export const SHOPIFY_HTTP_TIMEOUT_MS = 20_000
/** Products per page of a full sync; each carries up to 100 variants. */
export const SHOPIFY_PRODUCT_PAGE_SIZE = 25
export const SHOPIFY_ORDER_PAGE_SIZE = 50
export const SHOPIFY_DISCOUNT_PAGE_SIZE = 50
/**
 * `read_orders` only reaches the last 60 days of orders; asking further back
 * needs `read_all_orders`, which Shopify grants by request only.
 */
export const SHOPIFY_ORDER_SYNC_DAYS = 60

export const shopifyGraphqlUrl = (shopDomain: string) =>
  `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`

export const shopifyAccessTokenUrl = (shopDomain: string) =>
  `https://${shopDomain}/admin/oauth/access_token`

/** The merchant's admin pages, for "Open Shopify ↗" style links. */
export const shopifyAdminUrl = (shopDomain: string, path = "") =>
  `https://${shopDomain}/admin${path}`
