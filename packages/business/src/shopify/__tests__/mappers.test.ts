import type {
  ShopifyOrder,
  ShopifyProduct,
} from "@chatbotx.io/integration-shopify"
import { describe, expect, test } from "vitest"
import {
  mapShopifyDiscount,
  mapShopifyOrderState,
  mapShopifyProduct,
  nextMirroredStatus,
  shopifyOrderContactIdentifiers,
  splitCustomerName,
} from "../mappers"

const store = { shopDomain: "botxshop.myshopify.com", currency: "VND" }

const product = (overrides: Partial<ShopifyProduct> = {}): ShopifyProduct => ({
  id: "gid://shopify/Product/1",
  title: "Minimalist Leather Tote Bag",
  handle: "tote-bag",
  description: "A bag.",
  descriptionHtml: "<p>A bag.</p>",
  status: "ACTIVE",
  productType: "Bags",
  vendor: "BotX",
  tags: ["leather"],
  onlineStoreUrl: null,
  tracksInventory: true,
  totalInventory: 45,
  options: [
    { name: "Size", position: 1, optionValues: [{ name: "S" }, { name: "M" }] },
  ],
  media: { nodes: [{ image: { url: "https://cdn/1.jpg" } }, {}] },
  variants: {
    nodes: [
      {
        id: "gid://shopify/ProductVariant/11",
        title: "S",
        sku: "BAG-S",
        price: 119,
        inventoryQuantity: 15,
        availableForSale: true,
        selectedOptions: [{ name: "Size", value: "S" }],
        inventoryItem: { id: "gid://shopify/InventoryItem/111", tracked: true },
      },
      {
        id: "gid://shopify/ProductVariant/12",
        title: "M",
        sku: "",
        price: 129,
        inventoryQuantity: -2,
        availableForSale: false,
        selectedOptions: [{ name: "Size", value: "M" }],
        inventoryItem: { id: "gid://shopify/InventoryItem/112", tracked: true },
      },
    ],
  },
  ...overrides,
})

describe("mapShopifyProduct", () => {
  test("maps a product with options to variants keyed by Shopify id", () => {
    const mapped = mapShopifyProduct(product(), store)
    expect(mapped.categoryName).toBe("Bags")
    expect(mapped.vendorName).toBe("BotX")
    expect(mapped.values).toMatchObject({
      name: "Minimalist Leather Tote Bag",
      price: 119,
      currency: "VND",
      productUrl: "https://botxshop.myshopify.com/products/tote-bag",
      inventoryPolicy: "track",
      inventoryQuantity: 45,
      images: [{ url: "https://cdn/1.jpg", type: "link" }],
      status: "active",
      externalVariantId: null,
    })
    expect(mapped.options).toEqual([
      { name: "Size", values: ["S", "M"], position: 1 },
    ])
    expect(mapped.variants[0]).toMatchObject({
      externalId: "gid://shopify/ProductVariant/11",
      externalInventoryItemId: "gid://shopify/InventoryItem/111",
      combination: { Size: "S" },
      sku: "BAG-S",
      inventoryQuantity: 15,
    })
    // Oversold stock never shows as negative; an empty SKU is no SKU.
    expect(mapped.variants[1]).toMatchObject({
      sku: null,
      inventoryQuantity: 0,
    })
  })

  test("keeps no variants for a product sold without options", () => {
    const mapped = mapShopifyProduct(
      product({
        options: [
          {
            name: "Title",
            position: 1,
            optionValues: [{ name: "Default Title" }],
          },
        ],
      }),
      store,
    )
    expect(mapped.options).toEqual([])
    expect(mapped.variants).toEqual([])
    expect(mapped.values.externalVariantId).toBe(
      "gid://shopify/ProductVariant/11",
    )
  })

  test.each([
    ["ACTIVE", "active"],
    ["DRAFT", "draft"],
    ["UNLISTED", "unlisted"],
    ["ARCHIVED", "draft"],
    ["SOMETHING_NEW", "draft"],
  ] as const)("Shopify status %s maps to %s", (shopifyStatus, status) => {
    const { values } = mapShopifyProduct(
      product({ status: shopifyStatus }),
      store,
    )
    expect(values.status).toBe(status)
  })
})

const order = (overrides: Partial<ShopifyOrder> = {}): ShopifyOrder =>
  ({
    displayFinancialStatus: "PENDING",
    displayFulfillmentStatus: "UNFULFILLED",
    cancelledAt: null,
    fulfillments: [],
    ...overrides,
  }) as ShopifyOrder

describe("mapShopifyOrderState", () => {
  test.each([
    [{}, "pending", "unpaid", "unfulfilled"],
    [{ displayFinancialStatus: "PAID" }, "accepted", "paid", "unfulfilled"],
    [
      { displayFinancialStatus: "PAID", displayFulfillmentStatus: "FULFILLED" },
      "shipped",
      "paid",
      "fulfilled",
    ],
    [
      {
        displayFinancialStatus: "PAID",
        displayFulfillmentStatus: "FULFILLED",
        fulfillments: [{ displayStatus: "DELIVERED", trackingInfo: [] }],
      },
      "concluded",
      "paid",
      "fulfilled",
    ],
    [
      { displayFinancialStatus: "REFUNDED", cancelledAt: "2026-11-01" },
      "cancelled",
      "refunded",
      "unfulfilled",
    ],
  ] as const)("%o → %s", (overrides, status, payment, fulfillment) => {
    const state = mapShopifyOrderState(
      order(overrides as Partial<ShopifyOrder>),
    )
    expect(state.status).toBe(status)
    expect(state.paymentStatus).toBe(payment)
    expect(state.fulfillmentStatus).toBe(fulfillment)
  })

  test("reads the first tracking number", () => {
    const state = mapShopifyOrderState(
      order({
        displayFulfillmentStatus: "FULFILLED",
        fulfillments: [
          {
            displayStatus: "IN_TRANSIT",
            trackingInfo: [{ company: "USPS", number: "9400", url: null }],
          },
        ],
      }),
    )
    expect(state.tracking).toEqual({
      company: "USPS",
      number: "9400",
      url: null,
    })
  })
})

describe("nextMirroredStatus", () => {
  test("only moves forward and keeps finished orders finished", () => {
    expect(nextMirroredStatus("pending", "accepted")).toBe("accepted")
    expect(nextMirroredStatus("shipped", "accepted")).toBe("shipped")
    expect(nextMirroredStatus("accepted", "cancelled")).toBe("cancelled")
    expect(nextMirroredStatus("concluded", "cancelled")).toBe("concluded")
    expect(nextMirroredStatus("cancelled", "accepted")).toBe("cancelled")
  })
})

describe("mapShopifyDiscount", () => {
  const node = (codeDiscount: Record<string, unknown>) => ({
    id: "gid://shopify/DiscountCodeNode/1",
    codeDiscount: {
      __typename: "DiscountCodeBasic",
      status: "ACTIVE",
      codes: { nodes: [{ code: "FASHION10" }] },
      startsAt: "2026-11-01T00:00:00Z",
      endsAt: null,
      usageLimit: 3,
      asyncUsageCount: 5,
      ...codeDiscount,
    } as never,
  })

  test("maps a percentage off everything", () => {
    const mapped = mapShopifyDiscount(
      node({
        customerGets: {
          value: { __typename: "DiscountPercentage", percentage: 0.1 },
          items: { __typename: "AllDiscountItems", allItems: true },
        },
        minimumRequirement: {
          __typename: "DiscountMinimumSubtotal",
          greaterThanOrEqualToSubtotal: { amount: 100 },
        },
      }),
    )
    expect(mapped).toMatchObject({
      code: "FASHION10",
      discountType: "percentage",
      discountValue: 10,
      appliesTo: "entireOrder",
      minimumType: "amount",
      minimumValue: 100,
      // Kept within the limit for our check constraint.
      usedCount: 3,
      isActive: true,
    })
  })

  test("maps free shipping and skips what the cart cannot price", () => {
    expect(
      mapShopifyDiscount(node({ __typename: "DiscountCodeFreeShipping" }))
        ?.discountType,
    ).toBe("freeShipping")
    expect(
      mapShopifyDiscount(
        node({
          customerGets: {
            value: { __typename: "DiscountPercentage", percentage: 0.2 },
            items: { __typename: "DiscountCollections" },
          },
        }),
      ),
    ).toBeNull()
    expect(
      mapShopifyDiscount(node({ __typename: "DiscountCodeBxgy" })),
    ).toBeNull()
  })
})

describe("splitCustomerName", () => {
  test("puts the family name first, as Vietnamese names are written", () => {
    expect(splitCustomerName("Nguyen Van A")).toEqual({
      firstName: "Van A",
      lastName: "Nguyen",
    })
    expect(splitCustomerName("Emily")).toEqual({
      firstName: null,
      lastName: "Emily",
    })
  })
})

describe("shopifyOrderContactIdentifiers", () => {
  const order = (
    overrides: Partial<
      Pick<ShopifyOrder, "email" | "phone" | "customer" | "shippingAddress">
    >,
  ) => ({
    email: null,
    phone: null,
    customer: null,
    shippingAddress: null,
    ...overrides,
  })

  test("keeps the + of an E.164 phone, as contacts store it", () => {
    expect(
      shopifyOrderContactIdentifiers(order({ phone: "+84901234567" })),
    ).toEqual(["phone:+84901234567"])
  })

  test("reads a local phone in the shipping country", () => {
    expect(
      shopifyOrderContactIdentifiers(
        order({
          phone: "0901 234 567",
          shippingAddress: {
            countryCodeV2: "VN",
          } as ShopifyOrder["shippingAddress"],
        }),
      ),
    ).toEqual(["phone:+84901234567"])
  })

  test("tries the email first, lowercased", () => {
    expect(
      shopifyOrderContactIdentifiers(
        order({ email: "Ann@Example.com", phone: "+84901234567" }),
      ),
    ).toEqual(["email:ann@example.com", "phone:+84901234567"])
  })
})
