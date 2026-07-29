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
  ])("leaves the product type out when no name survives", (overrides) => {
    const mapped = toMetaItem(product(overrides), settings)
    expect(mapped.ok).toBe(true)
    expect(mapped.ok && "product_type" in mapped.data).toBe(false)
  })

  test("keeps a product with its own URL when the store URL is unset", () => {
    const mapped = toMetaItem(
      product({ productUrl: "https://brand.example.com/p/abc" }),
      { ...settings, storeUrl: null },
    )
    expect(mapped.ok).toBe(true)
  })
})
