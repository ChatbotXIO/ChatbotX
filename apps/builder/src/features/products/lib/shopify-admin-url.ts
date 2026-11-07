const TRAILING_DIGITS_PATTERN = /(\d+)$/

/** The numeric id at the end of a Shopify GID, or the input when it has none. */
export const shopifyNumericId = (globalId: string): string =>
  TRAILING_DIGITS_PATTERN.exec(globalId)?.[1] ?? globalId

export const shopifyProductAdminUrl = (input: {
  adminUrl: string
  externalId: string | null
}): string =>
  input.externalId
    ? `${input.adminUrl}/products/${shopifyNumericId(input.externalId)}`
    : `${input.adminUrl}/products`

export const shopifyOrderAdminUrl = (input: {
  adminUrl: string
  externalId: string | null
}): string =>
  input.externalId
    ? `${input.adminUrl}/orders/${shopifyNumericId(input.externalId)}`
    : `${input.adminUrl}/orders`

/** What the products page needs of the connected store to link into it. */
export type ShopifyStoreLinks = {
  shopDomain: string
  adminUrl: string
}
