import type {
  DiscountType,
  EcommerceSettings,
  OrderShippingAddress,
} from "@chatbotx.io/database/partials"
import {
  externalStoreRepository,
  woocommerceRepository,
} from "@chatbotx.io/database/repositories"
import type { IntegrationWoocommerceModel } from "@chatbotx.io/database/types"
import {
  createWooCommerceOrder,
  WooCommerceApiError,
  type WooCommerceOrder,
  type WooCommerceOrderCreateInput,
} from "@chatbotx.io/integration-woocommerce"
import {
  EXTERNAL_CONTACT_ATTRIBUTE,
  type ExternalCheckoutShopper,
  signContactReference,
  splitCustomerName,
} from "../external-store/orders"
import { orderService } from "../order/service"
import { resolveWooCommerceCredentials } from "./auth"
import {
  woocommerceNotConnectedException,
  woocommerceOrderRejectedException,
  woocommerceProductMissingException,
} from "./errors"
import { wooCommerceAnyAttributesOf, wooCommerceVariationIdOf } from "./mappers"
import {
  WOOCOMMERCE_CHECKOUT_META,
  WOOCOMMERCE_WEB_CHECKOUT,
  wooCommerceSyncService,
} from "./sync.service"

type CheckoutLine = {
  productId: string
  variantId?: string | null
  quantity: number
}

type CheckoutCustomer = {
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  shippingAddress: OrderShippingAddress | null
  note: string | null
}

/** The discount the cart applied; WooCommerce takes only its code. */
type CheckoutDiscount = {
  code: string
  discountType: DiscountType
  amount: number
  percent: number | null
}

type CheckoutInput = {
  shopper: ExternalCheckoutShopper
  lines: CheckoutLine[]
  customer: CheckoutCustomer
  discount: CheckoutDiscount | null
  settings: EcommerceSettings
  delivery: boolean
}

const requireConnection = async (
  workspaceId: string,
): Promise<IntegrationWoocommerceModel> => {
  const row = await woocommerceRepository.findIntegration(workspaceId)
  if (!row) {
    throw woocommerceNotConnectedException()
  }
  return row
}

/** The store's product and variation ids for the cart's lines. */
const resolveOrderLines = async (
  workspaceId: string,
  lines: CheckoutLine[],
): Promise<WooCommerceOrderCreateInput["lineItems"]> => {
  const ids = await externalStoreRepository.findCheckoutVariantIds({
    workspaceId,
    source: "woocommerce",
    productIds: lines.map((line) => line.productId),
    variantIds: lines.flatMap((line) =>
      line.variantId ? [line.variantId] : [],
    ),
  })
  return lines.map((line) => {
    const productId = Number(ids.productExternalIds.get(line.productId))
    const variation = line.variantId ? ids.byVariant.get(line.variantId) : null
    if (!productId || (line.variantId && !variation)) {
      throw woocommerceProductMissingException()
    }
    return {
      productId,
      variationId: variation
        ? Number(wooCommerceVariationIdOf(variation))
        : null,
      quantity: line.quantity,
      attributes: variation ? wooCommerceAnyAttributesOf(variation) : [],
    }
  })
}

const toAddress = (customer: CheckoutCustomer, withEmail: boolean) => {
  const address = customer.shippingAddress
  const name = splitCustomerName(customer.customerName)
  return {
    first_name: name.firstName ?? "",
    last_name: name.lastName,
    address_1: address?.line1 ?? "",
    address_2: address?.line2 ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    postcode: address?.zip ?? "",
    country: address?.country ?? "",
    ...(withEmail ? { email: customer.customerEmail ?? "" } : {}),
    phone: customer.customerPhone ?? "",
  }
}

/** Places an order on the store, turning its refusal into ours. */
const placeOnStore = async (
  input: CheckoutInput,
  mode: {
    status: "pending" | "processing"
    meta: Array<{ key: string; value: string }>
  },
): Promise<{ row: IntegrationWoocommerceModel; order: WooCommerceOrder }> => {
  const row = await requireConnection(input.shopper.workspaceId)
  const lineItems = await resolveOrderLines(
    input.shopper.workspaceId,
    input.lines,
  )
  const cashOnDelivery = mode.status === "processing"
  try {
    const order = await createWooCommerceOrder(
      await resolveWooCommerceCredentials(row),
      {
        status: mode.status,
        paymentMethod: cashOnDelivery ? "cod" : null,
        paymentMethodTitle: cashOnDelivery ? "Cash on delivery" : null,
        billing: toAddress(input.customer, true),
        shipping: input.delivery ? toAddress(input.customer, false) : null,
        lineItems,
        shippingLine: input.delivery
          ? { title: "Delivery", total: input.settings.shipping.deliveryCost }
          : null,
        couponCode: input.discount?.code ?? null,
        customerNote:
          [input.customer.note, input.delivery ? null : "Pick up in the store"]
            .filter(Boolean)
            .join("\n") || null,
        meta: [
          {
            key: EXTERNAL_CONTACT_ATTRIBUTE,
            value: await signContactReference(input.shopper),
          },
          ...mode.meta,
        ],
      },
    )
    return { row, order }
  } catch (error) {
    if (
      error instanceof WooCommerceApiError &&
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      !error.unauthorized
    ) {
      throw woocommerceOrderRejectedException(error.message)
    }
    throw error
  }
}

/** The customer's payment page of an unpaid order. */
const paymentUrlOf = (siteUrl: string, order: WooCommerceOrder) =>
  order.payment_url ??
  `${siteUrl}/checkout/order-pay/${order.id}/?pay_for_order=true&key=${encodeURIComponent(order.order_key)}`

/**
 * WooCommerce Web Checkout: an unpaid order is created on the store with the
 * cart, the customer's details and the coupon, and the customer is sent to
 * its payment page to pay with the store's own payment methods. The order
 * is mirrored here once it is paid (see `mirrorOrder`), tied to the contact
 * by the signed reference it carries; until then the cart stays.
 */
export const buildWooCommerceWebCheckoutUrl = async (
  input: CheckoutInput,
): Promise<string> => {
  const { row, order } = await placeOnStore(input, {
    status: "pending",
    meta: [{ key: WOOCOMMERCE_CHECKOUT_META, value: WOOCOMMERCE_WEB_CHECKOUT }],
  })
  return paymentUrlOf(row.siteUrl, order)
}

/**
 * In-App Checkout: places the order on the store right away (cash on
 * delivery, stock taken by WooCommerce) and mirrors it here at once, so the
 * customer lands on their order page. The `order.created` webhook that
 * follows finds the order already mirrored and only updates it.
 */
export const placeWooCommerceInAppOrder = async (input: CheckoutInput) => {
  const { row, order } = await placeOnStore(input, {
    status: "processing",
    meta: [],
  })
  const mirrored = await wooCommerceSyncService.mirrorOrder(row, order, {
    announce: true,
  })
  if (!mirrored) {
    throw new Error("The WooCommerce order could not be mirrored")
  }
  return await orderService.getDetail({
    workspaceId: input.shopper.workspaceId,
    orderId: mirrored.order.id,
  })
}
