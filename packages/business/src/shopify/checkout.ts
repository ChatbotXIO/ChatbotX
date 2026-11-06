import type {
  DiscountType,
  EcommerceSettings,
  OrderShippingAddress,
} from "@chatbotx.io/database/partials"
import { shopifyRepository } from "@chatbotx.io/database/repositories"
import { signShopToken } from "@chatbotx.io/encryption/shop-token"
import {
  buildShopifyCartPermalink,
  createShopifyOrder,
  type ShopifyOrderCreateInput,
  ShopifyUserError,
} from "@chatbotx.io/integration-shopify"
import { orderService } from "../order/service"
import { resolveShopifyCredentials } from "./auth"
import {
  shopifyNotConnectedException,
  shopifyOrderRejectedException,
  shopifyVariantMissingException,
} from "./errors"
import { splitCustomerName } from "./mappers"
import { SHOPIFY_CONTACT_ATTRIBUTE, shopifySyncService } from "./sync.service"

/**
 * How long the reference stamped on a Shopify checkout stays valid: a
 * customer may come back to Shopify's checkout page days later.
 */
const CONTACT_REFERENCE_TTL_MS = 30 * 24 * 60 * 60 * 1000

type CheckoutShopper = {
  workspaceId: string
  contactId: string
  contactInboxId: string | null
  conversationId: string | null
}

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

/** The discount the cart applied, as Shopify's checkout takes it. */
type CheckoutDiscount = {
  code: string
  discountType: DiscountType
  amount: number
  /** For a percentage code: its percent. */
  percent: number | null
}

/** Shopify variant GIDs for the cart, or `shopifyVariantMissing`. */
const resolveVariantLines = async (
  workspaceId: string,
  lines: CheckoutLine[],
) => {
  const ids = await shopifyRepository.findCheckoutVariantIds({
    workspaceId,
    productIds: lines.map((line) => line.productId),
    variantIds: lines.flatMap((line) =>
      line.variantId ? [line.variantId] : [],
    ),
  })
  return lines.map((line) => {
    const variantId = line.variantId
      ? ids.byVariant.get(line.variantId)
      : ids.byProduct.get(line.productId)
    if (!variantId) {
      throw shopifyVariantMissingException()
    }
    return { variantId, quantity: line.quantity }
  })
}

const contactReference = (shopper: CheckoutShopper) =>
  signShopToken(
    {
      workspaceId: shopper.workspaceId,
      contactId: shopper.contactId,
      contactInboxId: shopper.contactInboxId,
      conversationId: shopper.conversationId,
    },
    CONTACT_REFERENCE_TTL_MS,
  )

const toShopifyAddress = (customer: CheckoutCustomer) => {
  const address = customer.shippingAddress
  const name = splitCustomerName(customer.customerName)
  return {
    ...name,
    address1: [address?.line1, address?.line2].filter(Boolean)[0] ?? null,
    address2: address?.line1 && address.line2 ? address.line2 : null,
    city: address?.city ?? null,
    province: address?.state ?? null,
    zip: address?.zip ?? null,
    countryCode: address?.country ?? null,
    phone: customer.customerPhone,
  }
}

/**
 * Shopify Web Checkout: a cart permalink that opens the store's own checkout
 * with the cart, the customer's details and the discount filled in. The
 * order comes back through the `orders/create` webhook, tied to the contact
 * by the signed reference it carries.
 */
export const buildShopifyWebCheckoutUrl = async (input: {
  shopper: CheckoutShopper
  lines: CheckoutLine[]
  customer: CheckoutCustomer
  discount: CheckoutDiscount | null
}): Promise<string> => {
  const row = await shopifyRepository.findIntegration(input.shopper.workspaceId)
  if (!row) {
    throw shopifyNotConnectedException()
  }
  const lines = await resolveVariantLines(
    input.shopper.workspaceId,
    input.lines,
  )
  return buildShopifyCartPermalink({
    shopDomain: row.shopDomain,
    lines,
    email: input.customer.customerEmail,
    shippingAddress: toShopifyAddress(input.customer),
    discountCode: input.discount?.code ?? null,
    attributes: {
      [SHOPIFY_CONTACT_ATTRIBUTE]: await contactReference(input.shopper),
    },
  })
}

const toShopifyDiscount = (
  discount: CheckoutDiscount | null,
): ShopifyOrderCreateInput["discount"] => {
  if (!discount) {
    return null
  }
  if (discount.discountType === "percentage" && discount.percent !== null) {
    return {
      code: discount.code,
      kind: "percentage",
      percentage: discount.percent,
    }
  }
  if (discount.discountType === "freeShipping") {
    return {
      code: discount.code,
      kind: "freeShipping",
      amount: discount.amount,
    }
  }
  return { code: discount.code, kind: "fixedAmount", amount: discount.amount }
}

/**
 * In-App Checkout: places the order on Shopify right away (cash on delivery,
 * stock taken by Shopify) and mirrors it here at once, so the customer lands
 * on their order page. The `orders/create` webhook that follows finds the
 * order already mirrored and only updates it.
 */
export const placeShopifyInAppOrder = async (input: {
  shopper: CheckoutShopper
  lines: CheckoutLine[]
  customer: CheckoutCustomer
  discount: CheckoutDiscount | null
  settings: EcommerceSettings
  delivery: boolean
}) => {
  const row = await shopifyRepository.findIntegration(input.shopper.workspaceId)
  if (!row) {
    throw shopifyNotConnectedException()
  }
  const lines = await resolveVariantLines(
    input.shopper.workspaceId,
    input.lines,
  )
  const address = toShopifyAddress(input.customer)
  const deliveryCost = input.delivery ? input.settings.shipping.deliveryCost : 0

  let created: Awaited<ReturnType<typeof createShopifyOrder>>
  try {
    created = await createShopifyOrder(await resolveShopifyCredentials(row), {
      currencyCode: row.currency,
      lineItems: lines,
      email: input.customer.customerEmail,
      phone: input.customer.customerPhone,
      shippingAddress: input.delivery
        ? {
            firstName: address.firstName,
            lastName: address.lastName,
            address1: address.address1,
            address2: address.address2,
            city: address.city,
            // Shopify takes a province code; a free-text state goes in the
            // note instead of failing the order.
            provinceCode:
              address.province && address.province.length <= 3
                ? address.province.toUpperCase()
                : null,
            zip: address.zip,
            countryCode: address.countryCode,
            phone: address.phone,
          }
        : null,
      shippingLine: input.delivery
        ? { title: "Delivery", amount: deliveryCost }
        : null,
      discount: toShopifyDiscount(input.discount),
      note:
        [
          input.customer.note,
          address.province && address.province.length > 3
            ? `State / province: ${address.province}`
            : null,
          input.delivery ? null : "Pick up in the store",
        ]
          .filter(Boolean)
          .join("\n") || null,
      customAttributes: [
        {
          key: SHOPIFY_CONTACT_ATTRIBUTE,
          value: await contactReference(input.shopper),
        },
      ],
    })
  } catch (error) {
    if (error instanceof ShopifyUserError) {
      throw shopifyOrderRejectedException(error.message)
    }
    throw error
  }

  const { order } = await shopifySyncService.mirrorOrder(row, created, {
    announce: true,
  })
  return await orderService.getDetail({
    workspaceId: input.shopper.workspaceId,
    orderId: order.id,
  })
}
