import { z } from "zod"
import { type ShopifyCredentials, shopifyGraphql } from "../client"
import {
  SHOPIFY_DISCOUNT_PAGE_SIZE,
  SHOPIFY_PRODUCT_PAGE_SIZE,
} from "../constants"
import {
  pageInfoSchema,
  shopifyDiscountNodeSchema,
  shopifyProductSchema,
  shopifyShopSchema,
} from "../schemas"

const PRODUCT_FIELDS = `
  id
  title
  handle
  description
  descriptionHtml
  status
  productType
  vendor
  tags
  onlineStoreUrl
  tracksInventory
  totalInventory
  options { name position optionValues { name } }
  media(first: 10) { nodes { ... on MediaImage { image { url } } } }
  variants(first: 100) {
    nodes {
      id
      title
      sku
      price
      inventoryQuantity
      availableForSale
      selectedOptions { name value }
      inventoryItem { id tracked }
    }
  }
`

/** The store itself; also the cheapest call that proves a token works. */
export async function getShopifyShop(credentials: ShopifyCredentials) {
  const data = await shopifyGraphql(
    credentials,
    "query Shop { shop { name currencyCode myshopifyDomain } }",
    {},
    z.object({ shop: shopifyShopSchema }),
  )
  return data.shop
}

/** One page of products, newest-updated last, for a full sync. */
export async function listShopifyProducts(
  credentials: ShopifyCredentials,
  after: string | null,
) {
  const data = await shopifyGraphql(
    credentials,
    `query Products($first: Int!, $after: String) {
      products(first: $first, after: $after, sortKey: ID) {
        pageInfo { hasNextPage endCursor }
        nodes { ${PRODUCT_FIELDS} }
      }
    }`,
    { first: SHOPIFY_PRODUCT_PAGE_SIZE, after },
    z.object({
      products: z.object({
        pageInfo: pageInfoSchema,
        nodes: z.array(shopifyProductSchema),
      }),
    }),
  )
  return data.products
}

/** A single product, or null once it was deleted. */
export async function getShopifyProduct(
  credentials: ShopifyCredentials,
  productId: string,
) {
  const data = await shopifyGraphql(
    credentials,
    `query Product($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`,
    { id: productId },
    z.object({ product: shopifyProductSchema.nullable() }),
  )
  return data.product
}

/** The product an inventory item belongs to, for inventory webhooks. */
export async function getShopifyInventoryItemProductId(
  credentials: ShopifyCredentials,
  inventoryItemId: string,
) {
  const data = await shopifyGraphql(
    credentials,
    `query InventoryItem($id: ID!) {
      inventoryItem(id: $id) { variant { product { id } } }
    }`,
    { id: inventoryItemId },
    z.object({
      inventoryItem: z
        .object({
          variant: z
            .object({ product: z.object({ id: z.string() }) })
            .nullable(),
        })
        .nullable(),
    }),
  )
  return data.inventoryItem?.variant?.product.id ?? null
}

const CODE_DISCOUNT_FIELDS = `
  __typename
  ... on DiscountCodeBasic {
    title status startsAt endsAt usageLimit asyncUsageCount appliesOncePerCustomer
    codes(first: 1) { nodes { code } }
    minimumRequirement {
      __typename
      ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } }
      ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
    }
    customerGets {
      value {
        __typename
        ... on DiscountPercentage { percentage }
        ... on DiscountAmount { amount { amount } }
      }
      items {
        __typename
        ... on AllDiscountItems { allItems }
        ... on DiscountProducts { products(first: 100) { nodes { id } } }
      }
    }
  }
  ... on DiscountCodeFreeShipping {
    title status startsAt endsAt usageLimit asyncUsageCount appliesOncePerCustomer
    codes(first: 1) { nodes { code } }
    minimumRequirement {
      __typename
      ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } }
      ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
    }
  }
`

/** One page of code discounts (automatic discounts carry no code to apply). */
export async function listShopifyCodeDiscounts(
  credentials: ShopifyCredentials,
  after: string | null,
) {
  const data = await shopifyGraphql(
    credentials,
    `query CodeDiscounts($first: Int!, $after: String) {
      codeDiscountNodes(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id codeDiscount { ${CODE_DISCOUNT_FIELDS} } }
      }
    }`,
    { first: SHOPIFY_DISCOUNT_PAGE_SIZE, after },
    z.object({
      codeDiscountNodes: z.object({
        pageInfo: pageInfoSchema,
        nodes: z.array(shopifyDiscountNodeSchema),
      }),
    }),
  )
  return data.codeDiscountNodes
}

/** A single code discount, or null once it was deleted. */
export async function getShopifyCodeDiscount(
  credentials: ShopifyCredentials,
  discountId: string,
) {
  const data = await shopifyGraphql(
    credentials,
    `query CodeDiscount($id: ID!) {
      codeDiscountNode(id: $id) { id codeDiscount { ${CODE_DISCOUNT_FIELDS} } }
    }`,
    { id: discountId },
    z.object({ codeDiscountNode: shopifyDiscountNodeSchema.nullable() }),
  )
  return data.codeDiscountNode
}
