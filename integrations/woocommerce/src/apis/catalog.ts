import {
  type WooCommerceCredentials,
  woocommerceListAll,
  woocommerceRequest,
} from "../client"
import { WooCommerceApiError } from "../error"
import {
  type WooCommerceCoupon,
  type WooCommerceProduct,
  type WooCommerceVariation,
  wooCommerceCouponSchema,
  wooCommerceProductSchema,
  wooCommerceVariationSchema,
} from "../schemas"

/** A 404 (deleted, or never there) reads as nothing. */
const orNullWhenMissing = async <T>(read: () => Promise<T>) => {
  try {
    return await read()
  } catch (error) {
    if (error instanceof WooCommerceApiError && error.statusCode === 404) {
      return null
    }
    throw error
  }
}

/** Every product of the store, any status, page by page. */
export async function listWooCommerceProducts(
  credentials: WooCommerceCredentials,
  onPage: (products: WooCommerceProduct[]) => Promise<void>,
): Promise<void> {
  await woocommerceListAll(
    credentials,
    {
      path: "/products",
      query: { status: "any", orderby: "id", order: "asc" },
    },
    wooCommerceProductSchema,
    onPage,
  )
}

export async function getWooCommerceProduct(
  credentials: WooCommerceCredentials,
  productId: string,
): Promise<WooCommerceProduct | null> {
  return await orNullWhenMissing(
    async () =>
      (
        await woocommerceRequest(
          credentials,
          {
            method: "get",
            path: `/products/${encodeURIComponent(productId)}`,
          },
          wooCommerceProductSchema,
        )
      ).data,
  )
}

/** Every variation of a variable product. */
export async function listWooCommerceVariations(
  credentials: WooCommerceCredentials,
  productId: number,
): Promise<WooCommerceVariation[]> {
  const variations: WooCommerceVariation[] = []
  await woocommerceListAll(
    credentials,
    { path: `/products/${productId}/variations` },
    wooCommerceVariationSchema,
    (page) => {
      variations.push(...page)
      return Promise.resolve()
    },
  )
  return variations
}

/** Every coupon of the store, page by page. */
export async function listWooCommerceCoupons(
  credentials: WooCommerceCredentials,
  onPage: (coupons: WooCommerceCoupon[]) => Promise<void>,
): Promise<void> {
  await woocommerceListAll(
    credentials,
    { path: "/coupons", query: { orderby: "id", order: "asc" } },
    wooCommerceCouponSchema,
    onPage,
  )
}

export async function getWooCommerceCoupon(
  credentials: WooCommerceCredentials,
  couponId: string,
): Promise<WooCommerceCoupon | null> {
  return await orNullWhenMissing(
    async () =>
      (
        await woocommerceRequest(
          credentials,
          { method: "get", path: `/coupons/${encodeURIComponent(couponId)}` },
          wooCommerceCouponSchema,
        )
      ).data,
  )
}
