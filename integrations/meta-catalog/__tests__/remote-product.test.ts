import { describe, expect, test } from "vitest"
import { toImportedMetaProduct } from "../src/lib/remote-product"

describe("Meta Catalog inbound product mapper", () => {
  test("maps a valid remote product and preserves retailer identity", () => {
    const result = toImportedMetaProduct({
      id: "graph-product-1",
      retailer_id: "merchant-sku-1",
      name: "Imported product",
      description: "Description",
      price: "100",
      sale_price: "80",
      image_url: "https://cdn.example.com/main.jpg",
      additional_image_urls: [
        "https://cdn.example.com/main.jpg",
        "https://cdn.example.com/second.jpg",
      ],
      product_type: "Shoes",
      quantity_to_sell_on_facebook: "4",
      availability: "in stock",
    })

    expect(result).toEqual({
      ok: true,
      product: expect.objectContaining({
        retailerId: "merchant-sku-1",
        sku: "merchant-sku-1",
        price: 100,
        discount: 20,
        categoryName: "Shoes",
        inventoryQuantity: 4,
        inventoryPolicy: "track",
        images: [
          { type: "link", url: "https://cdn.example.com/main.jpg" },
          { type: "link", url: "https://cdn.example.com/second.jpg" },
        ],
      }),
    })
  })

  test.each([
    [{ name: "Missing retailer" }, "missing retailer_id"],
    [{ retailer_id: "remote-1" }, "missing name"],
    [
      { retailer_id: "remote-1", name: "Bad price", price: "not-a-number" },
      "price is invalid",
    ],
  ])("rejects incomplete remote product data", (remote, reason) => {
    expect(toImportedMetaProduct(remote)).toEqual(
      expect.objectContaining({
        ok: false,
        reason: expect.stringContaining(reason),
      }),
    )
  })

  test.each([
    ["100", 100],
    ["$9.99", 9.99],
    ["9.99 USD", 9.99],
    ["199.000₫", 199_000],
    ["199,000 VND", 199_000],
    ["1,234.56", 1234.56],
    ["14,50 EUR", 14.5],
  ])("parses the display price %s as %d", (price, expected) => {
    const result = toImportedMetaProduct({
      retailer_id: "remote-1",
      name: "Priced product",
      price,
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        product: expect.objectContaining({ price: expected }),
      }),
    )
  })

  test("carries the currency and storefront link back to the local product", () => {
    const result = toImportedMetaProduct({
      retailer_id: "remote-1",
      name: "Imported product",
      price: "199.000₫",
      currency: "vnd",
      url: "https://brand.example.com/p/abc",
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        product: expect.objectContaining({
          currency: "VND",
          productUrl: "https://brand.example.com/p/abc",
        }),
      }),
    )
  })

  test("drops an unsafe storefront link instead of storing it", () => {
    const result = toImportedMetaProduct({
      retailer_id: "remote-1",
      name: "Imported product",
      url: "javascript:alert(1)",
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        product: expect.objectContaining({ productUrl: undefined }),
      }),
    )
  })

  test("drops unsafe image protocols without rejecting the product", () => {
    const result = toImportedMetaProduct({
      retailer_id: "remote-1",
      name: "Safe product",
      image_url: "file:///etc/passwd",
      additional_image_urls: ["javascript:alert(1)"],
    })

    expect(result).toEqual({
      ok: true,
      product: expect.objectContaining({ images: [] }),
    })
  })
})
