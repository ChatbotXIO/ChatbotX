import { describe, expect, test } from "vitest"
import {
  type CatalogProduct,
  resolveMetaAvailability,
  SkipReason,
  toMetaItem,
} from "../src/lib/mapper"

const product = (overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: "123456789",
  name: "Product",
  shortDescription: "Description",
  longDescription: null,
  price: 9.99,
  discount: 0,
  inventoryPolicy: "track",
  inventoryQuantity: 5,
  allowOutOfStockPurchase: false,
  isActive: true,
  images: [{ url: "https://example.com/one.jpg", type: "link" }],
  tags: [],
  vendor: "ChatbotX",
  variants: [],
  ...overrides,
})

const settings = {
  currency: "USD",
  storeUrl: "https://shop.example.com",
  workspaceName: "Example Store",
}

describe("Meta Catalog product mapper", () => {
  test.each([
    [{ price: 9.99 }, "USD", "9.99 USD"],
    [{ price: 14 }, "GBP", "14 GBP"],
    [{ price: 199_000 }, "VND", "199000 VND"],
  ])("formats price using catalog settings", (overrides, currency, expected) => {
    const mapped = toMetaItem(product(overrides), {
      ...settings,
      currency,
    })
    expect(mapped.ok && mapped.data.price).toBe(expected)
  })

  test("uses immutable product ID and preserves all mapped limits", () => {
    const mapped = toMetaItem(
      product({
        name: "x".repeat(120),
        shortDescription: `<p>${"d".repeat(5100)}</p>`,
        images: Array.from({ length: 25 }, (_, index) => ({
          url: `https://example.com/${index}.jpg`,
          type: "link" as const,
        })),
      }),
      settings,
    )

    expect(mapped.ok).toBe(true)
    if (!mapped.ok) {
      return
    }
    expect(mapped.retailerId).toBe("123456789")
    expect(mapped.data.title).toHaveLength(100)
    expect(mapped.data.description).toHaveLength(5000)
    expect(mapped.data.description).not.toContain("<p>")
    expect(mapped.data.image).toHaveLength(21)
  })

  test.each([
    [{ isActive: false }, "discontinued"],
    [{ inventoryPolicy: "dont_track" }, "available for order"],
    [{ inventoryQuantity: 1 }, "in stock"],
    [
      { inventoryQuantity: 0, allowOutOfStockPurchase: true },
      "available for order",
    ],
    [{ inventoryQuantity: 0 }, "out of stock"],
  ])("resolves availability from the rule table", (overrides, expected) => {
    expect(resolveMetaAvailability(product(overrides))).toBe(expected)
  })

  test("sends zero stock to clear stale counters for untracked products", () => {
    const mapped = toMetaItem(
      product({ inventoryPolicy: "dont_track", inventoryQuantity: 42 }),
      settings,
    )

    expect(mapped.ok).toBe(true)
    expect(mapped.ok && mapped.data.quantity_to_sell_on_facebook).toBe(0)
  })

  test("keeps inactive untracked products distinguishable on round-trip", () => {
    const mapped = toMetaItem(
      product({
        inventoryPolicy: "dont_track",
        inventoryQuantity: 42,
        isActive: false,
      }),
      settings,
    )

    expect(mapped.ok).toBe(true)
    expect(mapped.ok && mapped.data).toMatchObject({
      availability: "discontinued",
      quantity_to_sell_on_facebook: 0,
    })
  })

  test.each([
    [{ images: [] }, {}, SkipReason.missingImage],
    [
      { shortDescription: null, longDescription: null },
      {},
      SkipReason.missingDescription,
    ],
    [{}, { storeUrl: null }, SkipReason.missingStoreUrl],
    [{ variants: [{}] }, {}, SkipReason.hasVariants],
  ])("reports each explicit skip reason", (overrides, settingOverrides, reason) => {
    expect(
      toMetaItem(product(overrides), {
        ...settings,
        ...settingOverrides,
      }),
    ).toEqual({ ok: false, productId: "123456789", reason })
  })

  test("prefers the product currency over the catalog-wide one", () => {
    const mapped = toMetaItem(product({ currency: "VND", price: 199_000 }), {
      ...settings,
      currency: "USD",
    })
    expect(mapped.ok && mapped.data.price).toBe("199000 VND")
  })

  test("prefers the product URL over the derived store link", () => {
    const mapped = toMetaItem(
      product({ productUrl: "https://brand.example.com/p/abc" }),
      settings,
    )
    expect(mapped.ok && mapped.data.link).toBe(
      "https://brand.example.com/p/abc",
    )
  })

  test("keeps short and long descriptions distinct and exports product tags", () => {
    const mapped = toMetaItem(
      product({
        shortDescription: "Short summary",
        longDescription: "<p>Full product description</p>",
        tags: [" Summer ", "", "featured", "sale", "vip", "last"],
      }),
      settings,
    )

    expect(mapped.ok).toBe(true)
    if (!mapped.ok) {
      return
    }
    expect(mapped.data).toMatchObject({
      description: "Full product description",
      short_description: "Short summary",
      custom_label_0: "Summer",
      custom_label_1: "featured",
      custom_label_2: "sale",
      custom_label_3: "vip",
      custom_label_4: "last",
    })
  })

  test("clears unused custom labels and short description explicitly", () => {
    const mapped = toMetaItem(
      product({
        shortDescription: null,
        longDescription: "Description",
        tags: [],
      }),
      settings,
    )

    expect(mapped.ok).toBe(true)
    expect(mapped.ok && mapped.data).toMatchObject({
      short_description: "",
      custom_label_0: "",
      custom_label_1: "",
      custom_label_2: "",
      custom_label_3: "",
      custom_label_4: "",
    })
  })

  test("falls back to short description when long description has no content", () => {
    const mapped = toMetaItem(
      product({
        shortDescription: "Useful summary",
        longDescription: "<p> </p>",
      }),
      settings,
    )

    expect(mapped.ok).toBe(true)
    expect(mapped.ok && mapped.data.description).toBe("Useful summary")
  })

  test.each<[Partial<CatalogProduct>, string]>([
    [
      { category: { name: "Men" }, subcategory: { name: "Shirts" } },
      "Men > Shirts",
    ],
    [{ category: { name: "Men" } }, "Men"],
    [{ subcategory: { name: "Shirts" } }, "Shirts"],
    [
      { category: { name: "  Men  " }, subcategory: { name: "  Shirts  " } },
      "Men > Shirts",
    ],
    [{ category: { name: "Men" }, subcategory: { name: "   " } }, "Men"],
  ])("sends the category path as the product type", (overrides, expected) => {
    const mapped = toMetaItem(product(overrides), settings)
    expect(mapped.ok).toBe(true)
    expect(mapped.ok && mapped.data.product_type).toBe(expected)
  })

  test.each<[Partial<CatalogProduct>]>([
    [{}],
    [{ category: null, subcategory: null }],
    [{ category: { name: "   " }, subcategory: { name: "" } }],
  ])("clears the product type when no category name survives", (overrides) => {
    const mapped = toMetaItem(product(overrides), settings)
    expect(mapped.ok).toBe(true)
    expect(mapped.ok && mapped.data.product_type).toBe("")
  })

  test("clears the remote sale price when the local discount is removed", () => {
    const mapped = toMetaItem(product({ discount: 0 }), settings)

    expect(mapped.ok).toBe(true)
    expect(mapped.ok && mapped.data.sale_price).toBe("")
  })

  test("keeps a product with its own URL when the store URL is unset", () => {
    const mapped = toMetaItem(
      product({ productUrl: "https://brand.example.com/p/abc" }),
      { ...settings, storeUrl: null },
    )
    expect(mapped.ok).toBe(true)
  })
})
