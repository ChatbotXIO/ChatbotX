import { describe, expect, test } from "vitest"
import { extractProductDraft } from "../src/default/handlers/imports/handler/products/extractor"

const columnMap = {
  name: "Name",
  price: "Price",
  discount: "Discount",
  inventoryQuantity: "Quantity",
  imageUrl: "Image",
  productUrl: "Product URL",
}

describe("product import row extraction", () => {
  test("normalizes a valid product row", () => {
    expect(
      extractProductDraft(
        {
          Name: " Product ",
          Price: "9.99",
          Discount: 10,
          Quantity: "5",
          Image: "https://example.com/product.jpg",
          "Product URL": "https://example.com/products/product",
        },
        columnMap,
        2,
      ),
    ).toEqual({
      ok: true,
      draft: {
        sourceRow: 2,
        name: "Product",
        price: 9.99,
        discount: 10,
        inventoryQuantity: 5,
        imageUrl: "https://example.com/product.jpg",
        productUrl: "https://example.com/products/product",
      },
    })
  })

  test.each([
    [{ Name: "" }, "Product name is required"],
    [{ Name: "P", Price: "abc" }, "Price must be a number"],
    [{ Name: "P", Price: -1 }, "Price cannot be negative"],
    [{ Name: "P", Discount: 101 }, "Discount must be between"],
    [{ Name: "P", Quantity: 1.5 }, "non-negative integer"],
    [{ Name: "P", Image: "ftp://example.com/a.jpg" }, "HTTP or HTTPS"],
    [{ Name: "P", Image: "not-a-url" }, "Image URL is invalid"],
    [
      { Name: "P", "Product URL": "ftp://example.com/product" },
      "Product URL must use HTTP or HTTPS",
    ],
    [{ Name: "P", "Product URL": "not-a-url" }, "Product URL is invalid"],
  ])("returns a row-level error without throwing", (row, expected) => {
    const result = extractProductDraft(row, columnMap, 3)
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining(expected),
    })
  })
})
