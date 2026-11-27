import { z } from "zod"
import {
  assertNoUserErrors,
  type ShopifyCredentials,
  shopifyGraphql,
} from "../client"
import { SHOPIFY_ORDER_PAGE_SIZE } from "../constants"
import {
  pageInfoSchema,
  shopifyOrderSchema,
  userErrorsSchema,
} from "../schemas"

const ADDRESS_FIELDS =
  "name firstName lastName address1 address2 city province zip countryCodeV2 phone"

const ORDER_FIELDS = `
  id
  name
  createdAt
  processedAt
  cancelledAt
  cancelReason
  displayFinancialStatus
  displayFulfillmentStatus
  email
  phone
  note
  currencyCode
  customAttributes { key value }
  discountCodes
  subtotalPriceSet { shopMoney { amount currencyCode } }
  totalDiscountsSet { shopMoney { amount currencyCode } }
  totalShippingPriceSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount currencyCode } }
  totalPriceSet { shopMoney { amount currencyCode } }
  customer { displayName email phone }
  shippingAddress { ${ADDRESS_FIELDS} }
  lineItems(first: 100) {
    nodes {
      id
      title
      variantTitle
      sku
      quantity
      originalUnitPriceSet { shopMoney { amount currencyCode } }
      totalDiscountSet { shopMoney { amount currencyCode } }
      variant { id }
      product { id }
      image { url }
    }
  }
  fulfillments(first: 10) {
    displayStatus
    trackingInfo(first: 1) { company number url }
  }
`

/** One page of the orders created since `createdAfter`, oldest first. */
export async function listShopifyOrders(
  credentials: ShopifyCredentials,
  input: { after: string | null; createdAfter: Date },
) {
  const data = await shopifyGraphql(
    credentials,
    `query Orders($first: Int!, $after: String, $query: String) {
      orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
        pageInfo { hasNextPage endCursor }
        nodes { ${ORDER_FIELDS} }
      }
    }`,
    {
      first: SHOPIFY_ORDER_PAGE_SIZE,
      after: input.after,
      query: `created_at:>=${input.createdAfter.toISOString()}`,
    },
    z.object({
      orders: z.object({
        pageInfo: pageInfoSchema,
        nodes: z.array(shopifyOrderSchema),
      }),
    }),
  )
  return data.orders
}

/** A single order, or null when it is gone or out of reach. */
export async function getShopifyOrder(
  credentials: ShopifyCredentials,
  orderId: string,
) {
  const data = await shopifyGraphql(
    credentials,
    `query Order($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`,
    { id: orderId },
    z.object({ order: shopifyOrderSchema.nullable() }),
  )
  return data.order
}

export type ShopifyOrderCreateInput = {
  currencyCode: string
  lineItems: Array<{ variantId: string; quantity: number }>
  email: string | null
  phone: string | null
  shippingAddress: {
    firstName: string | null
    lastName: string
    address1: string | null
    address2: string | null
    city: string | null
    provinceCode: string | null
    zip: string | null
    countryCode: string | null
    phone: string | null
  } | null
  shippingLine: { title: string; amount: number } | null
  discount:
    | { code: string; kind: "percentage"; percentage: number }
    | { code: string; kind: "fixedAmount"; amount: number }
    | { code: string; kind: "freeShipping"; amount: number }
    | null
  note: string | null
  customAttributes: Array<{ key: string; value: string }>
}

const discountCodeInput = (
  discount: NonNullable<ShopifyOrderCreateInput["discount"]>,
  currencyCode: string,
) => {
  switch (discount.kind) {
    case "percentage":
      return {
        itemPercentageDiscountCode: {
          code: discount.code,
          percentage: discount.percentage,
        },
      }
    case "fixedAmount":
      return {
        itemFixedDiscountCode: {
          code: discount.code,
          amountSet: {
            shopMoney: { amount: discount.amount, currencyCode },
          },
        },
      }
    default:
      return {
        freeShippingDiscountCode: {
          code: discount.code,
          amountSet: {
            shopMoney: { amount: discount.amount, currencyCode },
          },
        },
      }
  }
}

/**
 * Places an unpaid (cash on delivery) order on the store and takes its stock
 * the way the store's inventory policy says.
 */
export async function createShopifyOrder(
  credentials: ShopifyCredentials,
  input: ShopifyOrderCreateInput,
) {
  const order = {
    currency: input.currencyCode,
    financialStatus: "PENDING",
    lineItems: input.lineItems.map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
    })),
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.shippingAddress
      ? {
          shippingAddress: Object.fromEntries(
            Object.entries(input.shippingAddress).filter(
              ([, value]) => value !== null && value !== "",
            ),
          ),
        }
      : {}),
    ...(input.shippingLine
      ? {
          shippingLines: [
            {
              title: input.shippingLine.title,
              priceSet: {
                shopMoney: {
                  amount: input.shippingLine.amount,
                  currencyCode: input.currencyCode,
                },
              },
            },
          ],
        }
      : {}),
    ...(input.discount
      ? { discountCode: discountCodeInput(input.discount, input.currencyCode) }
      : {}),
    ...(input.note ? { note: input.note } : {}),
    customAttributes: input.customAttributes,
  }

  const data = await shopifyGraphql(
    credentials,
    `mutation OrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order { ${ORDER_FIELDS} }
        userErrors { field message }
      }
    }`,
    { order, options: { inventoryBehaviour: "DECREMENT_OBEYING_POLICY" } },
    z.object({
      orderCreate: z.object({
        order: shopifyOrderSchema.nullable(),
        userErrors: userErrorsSchema,
      }),
    }),
  )
  assertNoUserErrors(data.orderCreate.userErrors)
  if (!data.orderCreate.order) {
    throw new Error("Shopify created no order.")
  }
  return data.orderCreate.order
}
