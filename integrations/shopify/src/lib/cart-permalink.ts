import { fromShopifyGid } from "./gid"

export type ShopifyCartPermalinkInput = {
  shopDomain: string
  lines: Array<{ variantId: string; quantity: number }>
  email?: string | null
  shippingAddress?: {
    firstName?: string | null
    lastName?: string | null
    address1?: string | null
    address2?: string | null
    city?: string | null
    province?: string | null
    zip?: string | null
    countryCode?: string | null
    phone?: string | null
  } | null
  discountCode?: string | null
  /** Carried onto the order as note attributes, e.g. who placed it. */
  attributes?: Record<string, string>
}

const ADDRESS_KEYS = {
  firstName: "first_name",
  lastName: "last_name",
  address1: "address1",
  address2: "address2",
  city: "city",
  province: "province",
  zip: "zip",
  countryCode: "country",
  phone: "phone",
} as const

/**
 * A cart permalink: opening it fills a new Shopify checkout with the lines
 * and the customer's details, applies the discount code, and stores the
 * attributes on the order that checkout creates.
 */
export const buildShopifyCartPermalink = (
  input: ShopifyCartPermalinkInput,
): string => {
  const lines = input.lines
    .filter((line) => line.quantity > 0)
    .map((line) => `${fromShopifyGid(line.variantId)}:${line.quantity}`)
    .join(",")
  const url = new URL(`https://${input.shopDomain}/cart/${lines}`)
  const params = url.searchParams

  if (input.email) {
    params.set("checkout[email]", input.email)
  }
  for (const [key, field] of Object.entries(ADDRESS_KEYS)) {
    const value =
      input.shippingAddress?.[key as keyof typeof ADDRESS_KEYS] ?? null
    if (value) {
      params.set(`checkout[shipping_address][${field}]`, value)
    }
  }
  if (input.discountCode) {
    params.set("discount", input.discountCode)
  }
  for (const [key, value] of Object.entries(input.attributes ?? {})) {
    params.set(`attributes[${key}]`, value)
  }
  return url.toString()
}
