/**
 * Shopify names every object with a GID, `gid://shopify/Product/123`, while
 * webhook bodies and storefront URLs use the bare number.
 */
export const toShopifyGid = (type: string, id: string | number) =>
  `gid://shopify/${type}/${id}`

const GID_NUMBER_PATTERN = /\/(\d+)(?:\?.*)?$/

/** The numeric id at the end of a GID, or the input when it is already one. */
export const fromShopifyGid = (gid: string) => {
  const match = gid.match(GID_NUMBER_PATTERN)
  return match?.[1] ?? gid
}
