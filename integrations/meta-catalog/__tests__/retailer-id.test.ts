import { describe, expect, test } from "vitest"
import { resolveRetailerIds } from "../src/lib/retailer-id"

const noLinks = new Map<string, string>()

describe("Meta Catalog retailer id resolution", () => {
  test("sends the SKU as the Content ID when one is set", () => {
    const resolved = resolveRetailerIds({
      products: [{ id: "product-1", sku: "TSHIRT-BLK-M" }],
      linkedByProductId: noLinks,
    })

    expect(resolved.get("product-1")).toBe("TSHIRT-BLK-M")
  })

  test.each([
    ["missing", undefined],
    ["null", null],
    ["blank", "   "],
  ])("falls back to the product id when the SKU is %s", (_label, sku) => {
    const resolved = resolveRetailerIds({
      products: [{ id: "product-1", sku }],
      linkedByProductId: noLinks,
    })

    expect(resolved.get("product-1")).toBe("product-1")
  })

  test("trims the SKU so trailing spaces cannot fork the Content ID", () => {
    const resolved = resolveRetailerIds({
      products: [{ id: "product-1", sku: " SKU-1 " }],
      linkedByProductId: noLinks,
    })

    expect(resolved.get("product-1")).toBe("SKU-1")
  })

  test("keeps the id an already-pushed item carries, SKU or not", () => {
    const resolved = resolveRetailerIds({
      products: [{ id: "product-1", sku: "SKU-1" }],
      linkedByProductId: new Map([["product-1", "legacy-retailer-id"]]),
    })

    // Re-pushing under the SKU would make Meta create a second item instead of
    // updating the one already in the catalog.
    expect(resolved.get("product-1")).toBe("legacy-retailer-id")
  })

  test("gives a duplicated SKU to the first product only", () => {
    const resolved = resolveRetailerIds({
      products: [
        { id: "product-1", sku: "SKU-DUP" },
        { id: "product-2", sku: "SKU-DUP" },
      ],
      linkedByProductId: noLinks,
    })

    expect(resolved.get("product-1")).toBe("SKU-DUP")
    expect(resolved.get("product-2")).toBe("product-2")
  })

  test("leaves a SKU alone when another product already owns it in the catalog", () => {
    const resolved = resolveRetailerIds({
      products: [{ id: "product-2", sku: "SKU-IMPORTED" }],
      linkedByProductId: noLinks,
      ownerByRetailerId: new Map([["SKU-IMPORTED", "product-1"]]),
    })

    expect(resolved.get("product-2")).toBe("product-2")
  })

  test("reuses a SKU the product itself already owns", () => {
    const resolved = resolveRetailerIds({
      products: [{ id: "product-1", sku: "SKU-1" }],
      linkedByProductId: noLinks,
      ownerByRetailerId: new Map([["SKU-1", "product-1"]]),
    })

    expect(resolved.get("product-1")).toBe("SKU-1")
  })

  test("refuses a SKU that would steal another product's fallback id", () => {
    const resolved = resolveRetailerIds({
      products: [
        { id: "product-1", sku: "product-2" },
        { id: "product-2", sku: null },
      ],
      linkedByProductId: noLinks,
    })

    expect(resolved.get("product-1")).toBe("product-1")
    expect(resolved.get("product-2")).toBe("product-2")
  })

  test("assigns every product exactly one unique Content ID", () => {
    const products = [
      { id: "product-1", sku: "SKU-DUP" },
      { id: "product-2", sku: "SKU-DUP" },
      { id: "product-3", sku: null },
      { id: "product-4", sku: "SKU-TAKEN" },
      { id: "product-5", sku: "SKU-5" },
    ]

    const resolved = resolveRetailerIds({
      products,
      linkedByProductId: new Map([["product-3", "legacy-3"]]),
      ownerByRetailerId: new Map([["SKU-TAKEN", "other-product"]]),
    })

    const retailerIds = products.map((product) => resolved.get(product.id))
    expect(retailerIds).toEqual([
      "SKU-DUP",
      "product-2",
      "legacy-3",
      "product-4",
      "SKU-5",
    ])
    expect(new Set(retailerIds).size).toBe(products.length)
  })
})
