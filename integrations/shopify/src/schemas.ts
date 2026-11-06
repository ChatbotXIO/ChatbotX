import { z } from "zod"

/** Shopify sends money as a decimal string. */
const moneyAmount = z.string().transform((value) => Number.parseFloat(value))

const moneySet = z.object({
  shopMoney: z.object({ amount: moneyAmount, currencyCode: z.string() }),
})

export const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
})

export const shopifyShopSchema = z.object({
  name: z.string(),
  currencyCode: z.string(),
  myshopifyDomain: z.string(),
})
export type ShopifyShop = z.infer<typeof shopifyShopSchema>

export const shopifyVariantSchema = z.object({
  id: z.string(),
  title: z.string(),
  sku: z.string().nullable(),
  price: moneyAmount,
  inventoryQuantity: z.number().nullable(),
  availableForSale: z.boolean(),
  selectedOptions: z.array(z.object({ name: z.string(), value: z.string() })),
  inventoryItem: z.object({ id: z.string(), tracked: z.boolean() }).nullable(),
})
export type ShopifyVariant = z.infer<typeof shopifyVariantSchema>

export const shopifyProductSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
  description: z.string(),
  descriptionHtml: z.string(),
  /** ACTIVE, DRAFT, ARCHIVED (and UNLISTED on newer stores). */
  status: z.string(),
  productType: z.string(),
  vendor: z.string(),
  tags: z.array(z.string()),
  onlineStoreUrl: z.string().nullable(),
  tracksInventory: z.boolean(),
  totalInventory: z.number().nullable(),
  options: z.array(
    z.object({
      name: z.string(),
      position: z.number(),
      optionValues: z.array(z.object({ name: z.string() })),
    }),
  ),
  media: z.object({
    nodes: z.array(
      z
        .object({
          image: z.object({ url: z.string() }).nullable().optional(),
        })
        .loose(),
    ),
  }),
  variants: z.object({ nodes: z.array(shopifyVariantSchema) }),
})
export type ShopifyProduct = z.infer<typeof shopifyProductSchema>

const mailingAddressSchema = z.object({
  name: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  address1: z.string().nullable(),
  address2: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  zip: z.string().nullable(),
  countryCodeV2: z.string().nullable(),
  phone: z.string().nullable(),
})

export const shopifyOrderSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  processedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  /** PAID, PENDING, AUTHORIZED, PARTIALLY_PAID, REFUNDED, VOIDED, … */
  displayFinancialStatus: z.string().nullable(),
  /** FULFILLED, UNFULFILLED, PARTIALLY_FULFILLED, … */
  displayFulfillmentStatus: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  currencyCode: z.string(),
  customAttributes: z.array(
    z.object({ key: z.string(), value: z.string().nullable() }),
  ),
  discountCodes: z.array(z.string()),
  subtotalPriceSet: moneySet.nullable(),
  totalDiscountsSet: moneySet.nullable(),
  totalShippingPriceSet: moneySet,
  totalTaxSet: moneySet.nullable(),
  totalPriceSet: moneySet,
  customer: z
    .object({
      displayName: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    })
    .nullable(),
  shippingAddress: mailingAddressSchema.nullable(),
  lineItems: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        variantTitle: z.string().nullable(),
        sku: z.string().nullable(),
        quantity: z.number(),
        originalUnitPriceSet: moneySet,
        totalDiscountSet: moneySet,
        variant: z.object({ id: z.string() }).nullable(),
        product: z.object({ id: z.string() }).nullable(),
        image: z.object({ url: z.string() }).nullable(),
      }),
    ),
  }),
  fulfillments: z.array(
    z.object({
      /** DELIVERED, IN_TRANSIT, FULFILLED, … */
      displayStatus: z.string().nullable(),
      trackingInfo: z.array(
        z.object({
          company: z.string().nullable(),
          number: z.string().nullable(),
          url: z.string().nullable(),
        }),
      ),
    }),
  ),
})
export type ShopifyOrder = z.infer<typeof shopifyOrderSchema>

const discountMinimumSchema = z
  .object({
    __typename: z.string(),
    greaterThanOrEqualToSubtotal: z.object({ amount: moneyAmount }).optional(),
    greaterThanOrEqualToQuantity: z.string().optional(),
  })
  .nullable()
  .optional()

/** The parts of a code discount we can price in the cart. */
export const shopifyCodeDiscountSchema = z.object({
  __typename: z.string(),
  title: z.string().optional(),
  /** ACTIVE, EXPIRED, SCHEDULED. */
  status: z.string().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  usageLimit: z.number().nullable().optional(),
  asyncUsageCount: z.number().optional(),
  appliesOncePerCustomer: z.boolean().optional(),
  codes: z
    .object({ nodes: z.array(z.object({ code: z.string() })) })
    .optional(),
  minimumRequirement: discountMinimumSchema,
  customerGets: z
    .object({
      value: z
        .object({
          __typename: z.string(),
          percentage: z.number().optional(),
          amount: z.object({ amount: moneyAmount }).optional(),
        })
        .loose(),
      items: z
        .object({
          __typename: z.string(),
          allItems: z.boolean().optional(),
          products: z
            .object({ nodes: z.array(z.object({ id: z.string() })) })
            .optional(),
        })
        .loose(),
    })
    .optional(),
})
export type ShopifyCodeDiscount = z.infer<typeof shopifyCodeDiscountSchema>

export const shopifyDiscountNodeSchema = z.object({
  id: z.string(),
  codeDiscount: shopifyCodeDiscountSchema,
})
export type ShopifyDiscountNode = z.infer<typeof shopifyDiscountNodeSchema>

export const userErrorsSchema = z.array(
  z.object({
    field: z.array(z.string()).nullable().optional(),
    message: z.string(),
  }),
)
