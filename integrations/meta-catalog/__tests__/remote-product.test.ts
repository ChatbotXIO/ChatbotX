import { describe, expect, test } from "vitest"
import { toImportedMetaProduct } from "../src/lib/remote-product"

describe("Meta Catalog inbound product mapper", () => {
  test("maps a valid remote product and preserves retailer identity", () => {
    const result = toImportedMetaProduct({
      id: "graph-product-1",
      retailer_id: "merchant-sku-1",
      name: "Imported product",
      description: "Description",
      short_description: "Short description",
      price: "100",
      sale_price: "80",
      image_url: "https://cdn.example.com/main.jpg",
      additional_image_urls: [
        "https://cdn.example.com/main.jpg",
        "https://cdn.example.com/second.jpg",
      ],
      product_type: "Shoes",
      custom_label_0: "featured",
      custom_label_1: "summer",
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
        longDescription: "Description",
        shortDescription: "Short description",
        tags: ["featured", "summer"],
        inventoryQuantity: 4,
        inventoryPolicy: "track",
        allowOutOfStockPurchase: false,
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
        product: expect.not.objectContaining({
          productUrl: expect.anything(),
        }),
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
      product: expect.not.objectContaining({ images: expect.anything() }),
    })
  })

  test("prefers original localized images over Meta CDN copies", () => {
    const result = toImportedMetaProduct({
      retailer_id: "remote-images",
      name: "Product with images",
      image_url: "",
      additional_image_urls: [],
      images: {
        en_US: [{ url: "https://origin.example.com/main.jpg", tag: ["en_US"] }],
      },
      image_cdn_urls: {
        en_US: "https://cdn.example.com/main.jpg",
      },
      additional_image_cdn_urls: [
        "https://cdn.example.com/second.jpg",
        "https://origin.example.com/main.jpg",
      ],
    })

    expect(result).toEqual({
      ok: true,
      product: expect.objectContaining({
        images: [{ type: "link", url: "https://origin.example.com/main.jpg" }],
      }),
    })
  })

  test("falls back to Meta CDN images when original image fields are empty", () => {
    const result = toImportedMetaProduct({
      retailer_id: "remote-cdn-images",
      name: "Product with CDN images",
      image_url: "",
      additional_image_urls: [],
      image_cdn_urls: {
        en_US: "https://cdn.example.com/main.jpg",
      },
      additional_image_cdn_urls: [
        "https://cdn.example.com/second.jpg",
        "https://cdn.example.com/main.jpg",
      ],
    })

    expect(result).toEqual({
      ok: true,
      product: expect.objectContaining({
        images: [
          { type: "link", url: "https://cdn.example.com/main.jpg" },
          { type: "link", url: "https://cdn.example.com/second.jpg" },
        ],
      }),
    })
  })

  test("preserves ambiguous available-for-order inventory policy", () => {
    const result = toImportedMetaProduct({
      retailer_id: "remote-inventory",
      name: "Backordered product",
      quantity_to_sell_on_facebook: "0",
      availability: "available for order",
      product_type: "Home > Robot vacuums",
    })

    expect(result).toEqual({
      ok: true,
      product: expect.objectContaining({
        categoryName: "Home",
        subcategoryName: "Robot vacuums",
        inventoryQuantity: 0,
      }),
    })
    expect(result).toEqual({
      ok: true,
      product: expect.not.objectContaining({
        inventoryPolicy: expect.anything(),
        allowOutOfStockPurchase: expect.anything(),
      }),
    })
  })

  test("preserves inventory policy when a zero-quantity product is discontinued", () => {
    const result = toImportedMetaProduct({
      retailer_id: "remote-inactive-untracked",
      name: "Inactive untracked product",
      quantity_to_sell_on_facebook: "0",
      availability: "discontinued",
    })

    expect(result).toEqual({
      ok: true,
      product: expect.objectContaining({
        inventoryQuantity: 0,
        isActive: false,
      }),
    })
    expect(result).toEqual({
      ok: true,
      product: expect.not.objectContaining({
        inventoryPolicy: expect.anything(),
        allowOutOfStockPurchase: expect.anything(),
      }),
    })
  })

  test("rejects malformed sale price instead of clearing local discount", () => {
    expect(
      toImportedMetaProduct({
        retailer_id: "remote-invalid-sale",
        name: "Invalid sale",
        price: "100 USD",
        sale_price: "not-a-price",
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        reason: expect.stringContaining("sale price is invalid"),
      }),
    )
  })

  test("does not invent inventory settings when Meta omits quantity", () => {
    const result = toImportedMetaProduct({
      retailer_id: "remote-no-inventory",
      name: "Ads-only product",
      availability: "in stock",
    })

    expect(result).toEqual({
      ok: true,
      product: expect.not.objectContaining({
        price: expect.anything(),
        discount: expect.anything(),
        inventoryQuantity: expect.anything(),
        inventoryPolicy: expect.anything(),
        allowOutOfStockPurchase: expect.anything(),
        isActive: expect.anything(),
      }),
    })
  })

  test("preserves explicit clears for nullable local product fields", () => {
    const result = toImportedMetaProduct({
      retailer_id: "remote-cleared-fields",
      name: "Cleared product",
      description: "",
      short_description: "",
      brand: "",
      product_type: "",
      url: "",
    })

    expect(result).toEqual({
      ok: true,
      product: expect.objectContaining({
        productUrl: null,
        shortDescription: null,
        longDescription: null,
        vendor: null,
        categoryName: null,
        subcategoryName: null,
      }),
    })
  })
})
