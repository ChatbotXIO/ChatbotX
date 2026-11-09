import {
  type WooCommerceCredentials,
  woocommerceListAll,
  woocommerceRequest,
} from "../client"
import { WooCommerceApiError } from "../error"
import { type WooCommerceOrder, wooCommerceOrderSchema } from "../schemas"

/** The orders created after `createdAfter`, oldest first, page by page. */
export async function listWooCommerceOrders(
  credentials: WooCommerceCredentials,
  input: { createdAfter: Date },
  onPage: (orders: WooCommerceOrder[]) => Promise<void>,
): Promise<void> {
  await woocommerceListAll(
    credentials,
    {
      path: "/orders",
      query: {
        after: input.createdAfter.toISOString(),
        orderby: "date",
        order: "asc",
      },
    },
    wooCommerceOrderSchema,
    onPage,
  )
}

export async function getWooCommerceOrder(
  credentials: WooCommerceCredentials,
  orderId: string,
): Promise<WooCommerceOrder | null> {
  try {
    return (
      await woocommerceRequest(
        credentials,
        { method: "get", path: `/orders/${encodeURIComponent(orderId)}` },
        wooCommerceOrderSchema,
      )
    ).data
  } catch (error) {
    if (error instanceof WooCommerceApiError && error.statusCode === 404) {
      return null
    }
    throw error
  }
}

type WooCommerceAddressInput = {
  first_name: string
  last_name: string
  address_1: string
  address_2: string
  city: string
  state: string
  postcode: string
  country: string
  email?: string
  phone: string
}

/** What `createWooCommerceOrder` sends; see WooCommerce's `POST /orders`. */
export type WooCommerceOrderCreateInput = {
  status: "pending" | "processing"
  paymentMethod: string | null
  paymentMethodTitle: string | null
  billing: WooCommerceAddressInput
  shipping: WooCommerceAddressInput | null
  lineItems: Array<{
    productId: number
    variationId: number | null
    quantity: number
    /**
     * The values picked for a variation's "Any …" attributes, as line meta
     * (`Size: M`), so the order says what to ship.
     */
    attributes?: Array<{ name: string; value: string }>
  }>
  shippingLine: { title: string; total: number } | null
  couponCode: string | null
  customerNote: string | null
  meta: Array<{ key: string; value: string }>
}

/**
 * Creates an order on the store. WooCommerce prices the lines and applies
 * the coupon itself; a `processing` order takes stock at once, a `pending`
 * one when it is paid.
 */
export async function createWooCommerceOrder(
  credentials: WooCommerceCredentials,
  input: WooCommerceOrderCreateInput,
): Promise<WooCommerceOrder> {
  const { data } = await woocommerceRequest(
    credentials,
    {
      method: "post",
      path: "/orders",
      json: {
        status: input.status,
        set_paid: false,
        ...(input.paymentMethod
          ? {
              payment_method: input.paymentMethod,
              payment_method_title: input.paymentMethodTitle ?? "",
            }
          : {}),
        billing: input.billing,
        ...(input.shipping ? { shipping: input.shipping } : {}),
        line_items: input.lineItems.map((line) => ({
          product_id: line.productId,
          ...(line.variationId ? { variation_id: line.variationId } : {}),
          quantity: line.quantity,
          ...(line.attributes?.length
            ? {
                meta_data: line.attributes.map((attribute) => ({
                  key: attribute.name,
                  value: attribute.value,
                })),
              }
            : {}),
        })),
        shipping_lines: input.shippingLine
          ? [
              {
                method_id: "flat_rate",
                method_title: input.shippingLine.title,
                total: input.shippingLine.total.toFixed(2),
              },
            ]
          : [],
        coupon_lines: input.couponCode ? [{ code: input.couponCode }] : [],
        customer_note: input.customerNote ?? "",
        meta_data: input.meta,
      },
    },
    wooCommerceOrderSchema,
  )
  return data
}
