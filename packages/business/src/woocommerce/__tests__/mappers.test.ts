import {
  wooCommerceCouponSchema,
  wooCommerceOrderSchema,
  wooCommerceProductSchema,
  wooCommerceVariationSchema,
} from "@chatbotx.io/integration-woocommerce"
import { describe, expect, test } from "vitest"
import {
  htmlToPlainText,
  isMirrorableWooCommerceOrder,
  mapWooCommerceCoupon,
  mapWooCommerceOrderState,
  mapWooCommerceProduct,
  mapWooCommerceProductStatus,
  wooCommerceAnyAttributesOf,
  wooCommerceOrderContactIdentifiers,
  wooCommerceOrderExternalId,
  wooCommerceOrderIdOf,
  wooCommerceVariationIdOf,
} from "../mappers"

const store = { currency: "VND" }

const product = (overrides: Record<string, unknown> = {}) =>
  wooCommerceProductSchema.parse({
    id: 10,
    name: "Leather Tote",
    slug: "leather-tote",
    permalink: "https://shop.example.com/product/leather-tote/",
    type: "simple",
    status: "publish",
    catalog_visibility: "visible",
    description:
      "<p>A <strong>soft</strong> bag &amp; more.</p><p>Second line</p>",
    short_description: "",
    sku: "TOTE",
    price: "250000",
    regular_price: "300000",
    manage_stock: true,
    stock_quantity: 4,
    stock_status: "instock",
    backorders: "no",
    categories: [
      { id: 1, name: "Uncategorized", slug: "uncategorized" },
      { id: 2, name: "Bags", slug: "bags" },
    ],
    tags: [{ id: 3, name: "leather", slug: "leather" }],
    brands: [{ id: 4, name: "BotX", slug: "botx" }],
    images: [{ src: "https://shop.example.com/tote.jpg" }],
    ...overrides,
  })

const variation = (overrides: Record<string, unknown> = {}) =>
  wooCommerceVariationSchema.parse({
    id: 21,
    sku: "TOTE-BLK-M",
    price: "260000",
    status: "publish",
    manage_stock: true,
    stock_quantity: 3,
    stock_status: "instock",
    attributes: [
      { id: 1, name: "Color", option: "Black" },
      { id: 2, name: "Size", option: "M" },
    ],
    ...overrides,
  })

const variableProduct = () =>
  product({
    type: "variable",
    manage_stock: false,
    stock_quantity: null,
    attributes: [
      {
        id: 1,
        name: "Color",
        position: 0,
        variation: true,
        options: ["Black", "Brown"],
      },
      {
        id: 2,
        name: "Size",
        position: 1,
        variation: true,
        options: ["M", "L"],
      },
      {
        id: 3,
        name: "Material",
        position: 2,
        variation: false,
        options: ["Leather"],
      },
    ],
  })

describe("mapWooCommerceProductStatus", () => {
  test.each([
    ["publish", "visible", "active"],
    ["publish", "hidden", "unlisted"],
    ["private", "visible", "unlisted"],
    ["draft", "visible", "draft"],
    ["pending", "visible", "draft"],
    ["future", "visible", "draft"],
  ] as const)("%s / %s → %s", (status, visibility, expected) => {
    expect(
      mapWooCommerceProductStatus({
        status,
        catalog_visibility: visibility,
      }),
    ).toBe(expected)
  })
})

describe("mapWooCommerceProduct", () => {
  test("a simple product orders by its own id and keeps no variants", () => {
    const mapped = mapWooCommerceProduct(product(), [], store)
    expect(mapped.externalId).toBe("10")
    expect(mapped.categoryName).toBe("Bags")
    expect(mapped.vendorName).toBe("BotX")
    expect(mapped.variants).toEqual([])
    expect(mapped.options).toEqual([])
    expect(mapped.values).toMatchObject({
      name: "Leather Tote",
      price: 250_000,
      currency: "VND",
      inventoryPolicy: "track",
      inventoryQuantity: 4,
      status: "active",
      externalVariantId: "10",
      longDescription: "A soft bag & more.\nSecond line",
      tags: ["leather"],
    })
  })

  test("an unmanaged product out of stock is not sold", () => {
    const mapped = mapWooCommerceProduct(
      product({
        manage_stock: false,
        stock_quantity: null,
        stock_status: "outofstock",
      }),
      [],
      store,
    )
    expect(mapped.values.inventoryPolicy).toBe("track")
    expect(mapped.values.inventoryQuantity).toBe(0)
  })

  test("a variable product's variation attributes become its options", () => {
    const mapped = mapWooCommerceProduct(
      variableProduct(),
      [variation(), variation({ id: 22, price: "240000", status: "private" })],
      store,
    )
    expect(mapped.options).toEqual([
      { name: "Color", values: ["Black", "Brown"], position: 0 },
      { name: "Size", values: ["M", "L"], position: 1 },
    ])
    expect(mapped.values.externalVariantId).toBeNull()
    // The cheapest variant still on sale.
    expect(mapped.values.price).toBe(260_000)
    expect(mapped.values.inventoryPolicy).toBe("dont_track")
    expect(mapped.variants[0]).toMatchObject({
      externalId: "21",
      combination: { Color: "Black", Size: "M" },
      sku: "TOTE-BLK-M",
      inventoryQuantity: 3,
      isEnabled: true,
    })
    expect(mapped.variants[1]?.isEnabled).toBe(false)
  })

  test('an "Any …" attribute expands to one variant per value', () => {
    const mapped = mapWooCommerceProduct(
      variableProduct(),
      [
        variation({
          id: 30,
          manage_stock: "parent",
          stock_quantity: null,
          attributes: [{ id: 1, name: "Color", option: "Black" }],
        }),
      ],
      store,
    )
    expect(mapped.variants.map((variant) => variant.externalId)).toEqual([
      "30~Size=M",
      "30~Size=L",
    ])
    expect(mapped.variants.map((variant) => variant.combination)).toEqual([
      { Color: "Black", Size: "M" },
      { Color: "Black", Size: "L" },
    ])
    expect(mapped.variants[0]?.inventoryQuantity).toBeNull()
    expect(wooCommerceVariationIdOf("30~Size=L")).toBe("30")
    expect(wooCommerceVariationIdOf("21")).toBe("21")
    expect(wooCommerceAnyAttributesOf("30~Size=L")).toEqual([
      { name: "Size", value: "L" },
    ])
    expect(wooCommerceAnyAttributesOf("21")).toEqual([])
  })

  test('an "Any …" variant keeps its id when a value is added', () => {
    const withMoreSizes = product({
      type: "variable",
      manage_stock: false,
      stock_quantity: null,
      attributes: [
        {
          id: 1,
          name: "Color",
          position: 0,
          variation: true,
          options: ["Black"],
        },
        {
          id: 2,
          name: "Size",
          position: 1,
          variation: true,
          options: ["XS", "M", "L"],
        },
      ],
    })
    const anyColorAndSize = variation({ id: 31, attributes: [] })
    const mapped = mapWooCommerceProduct(
      withMoreSizes,
      [anyColorAndSize],
      store,
    )
    const sizeM = mapped.variants.find(
      (variant) => variant.combination.Size === "M",
    )
    // The same id the variant had before XS was added.
    expect(sizeM?.externalId).toBe("31~Color=Black&Size=M")
  })

  test("odd characters in a value survive the round trip", () => {
    const mapped = mapWooCommerceProduct(
      product({
        type: "variable",
        manage_stock: false,
        stock_quantity: null,
        attributes: [
          {
            id: 1,
            name: "Kích cỡ",
            position: 0,
            variation: true,
            options: ["M & L~"],
          },
        ],
      }),
      [variation({ id: 32, attributes: [] })],
      store,
    )
    const externalId = mapped.variants[0]?.externalId as string
    expect(wooCommerceVariationIdOf(externalId)).toBe("32")
    expect(wooCommerceAnyAttributesOf(externalId)).toEqual([
      { name: "Kích cỡ", value: "M & L~" },
    ])
  })
})

const coupon = (overrides: Record<string, unknown> = {}) =>
  wooCommerceCouponSchema.parse({
    id: 5,
    code: "sale10",
    amount: "10",
    discount_type: "percent",
    status: "publish",
    date_created_gmt: "2026-11-01T00:00:00",
    date_expires_gmt: null,
    usage_count: 3,
    usage_limit: 2,
    minimum_amount: "100",
    maximum_amount: "",
    ...overrides,
  })

describe("mapWooCommerceCoupon", () => {
  test("a percent coupon on the whole cart", () => {
    expect(mapWooCommerceCoupon(coupon())).toMatchObject({
      externalId: "5",
      code: "sale10",
      discountType: "percentage",
      discountValue: 10,
      appliesTo: "entireOrder",
      minimumType: "amount",
      minimumValue: 100,
      usageLimit: 2,
      usedCount: 2,
      startsAt: new Date("2026-11-01T00:00:00Z"),
      endsAt: null,
    })
  })

  test("a fixed cart coupon on listed products", () => {
    expect(
      mapWooCommerceCoupon(
        coupon({ discount_type: "fixed_cart", amount: "5", product_ids: [10] }),
      ),
    ).toMatchObject({
      discountType: "fixedAmount",
      appliesTo: "products",
      productExternalIds: ["10"],
    })
  })

  test("a free-shipping-only coupon", () => {
    expect(
      mapWooCommerceCoupon(coupon({ amount: "0", free_shipping: true })),
    ).toMatchObject({ discountType: "freeShipping", discountValue: 0 })
  })

  test.each([
    { discount_type: "fixed_product" },
    { product_categories: [3] },
    { excluded_product_ids: [9] },
    { email_restrictions: ["a@example.com"] },
    { exclude_sale_items: true },
    { maximum_amount: "500" },
    { status: "draft" },
  ])("leaves out a coupon our cart cannot price: %o", (overrides) => {
    expect(mapWooCommerceCoupon(coupon(overrides))).toBeNull()
  })
})

const order = (overrides: Record<string, unknown> = {}) =>
  wooCommerceOrderSchema.parse({
    id: 99,
    number: "99",
    status: "processing",
    currency: "VND",
    total: "255000",
    billing: {
      first_name: "An",
      last_name: "Nguyen",
      email: "An@Example.com",
      phone: "0901 234 567",
      country: "VN",
    },
    shipping: {},
    ...overrides,
  })

describe("mapWooCommerceOrderState", () => {
  test.each([
    [{ status: "pending" }, "pending", "unpaid", "unfulfilled"],
    [{ status: "on-hold" }, "pending", "unpaid", "unfulfilled"],
    [{ status: "processing" }, "accepted", "unpaid", "unfulfilled"],
    [
      { status: "processing", date_paid_gmt: "2026-11-08T01:00:00" },
      "accepted",
      "paid",
      "unfulfilled",
    ],
    [{ status: "completed" }, "concluded", "paid", "fulfilled"],
    [{ status: "refunded" }, "accepted", "refunded", "unfulfilled"],
    [{ status: "cancelled" }, "cancelled", "unpaid", "unfulfilled"],
    [{ status: "failed" }, "cancelled", "unpaid", "unfulfilled"],
  ] as const)("%o", (overrides, status, paymentStatus, fulfillmentStatus) => {
    expect(mapWooCommerceOrderState(order(overrides))).toMatchObject({
      status,
      paymentStatus,
      fulfillmentStatus,
    })
  })

  test("reads the Shipment Tracking extension's first item", () => {
    expect(
      mapWooCommerceOrderState(
        order({
          meta_data: [
            {
              key: "_wc_shipment_tracking_items",
              value: [
                {
                  tracking_provider: "GHN",
                  tracking_number: "GHN123",
                  custom_tracking_link: "",
                },
              ],
            },
          ],
        }),
      ).tracking,
    ).toEqual({ company: "GHN", number: "GHN123", url: null })
  })
})

test("drafts and trashed orders are not mirrored", () => {
  expect(
    isMirrorableWooCommerceOrder(order({ status: "checkout-draft" })),
  ).toBe(false)
  expect(isMirrorableWooCommerceOrder(order({ status: "trash" }))).toBe(false)
  expect(isMirrorableWooCommerceOrder(order())).toBe(true)
})

test("looks the customer up by lowercased email, then E.164 phone", () => {
  expect(wooCommerceOrderContactIdentifiers(order())).toEqual([
    "email:an@example.com",
    "phone:+84901234567",
  ])
})

test("htmlToPlainText keeps paragraphs and decodes entities", () => {
  expect(
    htmlToPlainText("<p>Hello&nbsp;world</p><ul><li>One</li><li>Two</li></ul>"),
  ).toBe("Hello world\nOne\nTwo")
})

test("a WooCommerce order's externalId carries its site", () => {
  const externalId = wooCommerceOrderExternalId(
    "https://shop.example.com/store",
    1234,
  )
  expect(externalId).toBe("shop.example.com/store#1234")
  expect(wooCommerceOrderIdOf(externalId)).toBe("1234")
  expect(
    wooCommerceOrderExternalId("https://other.example.com", 1234),
  ).not.toBe(externalId)
})

describe("currencySymbolFor", () => {
  test("knows the usual symbols, and none for a code without one", async () => {
    const { currencySymbolFor } = await import(
      "../../ecommerce-settings/store-source"
    )
    expect(currencySymbolFor("VND")).toBe("₫")
    expect(currencySymbolFor("USD")).toBe("$")
    expect(currencySymbolFor("CHF")).toBeNull()
    expect(currencySymbolFor("not-a-code")).toBeNull()
  })
})
