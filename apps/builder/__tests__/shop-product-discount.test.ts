import { describe, expect, test } from "vitest"
import {
  discountedPrice,
  toShopProduct,
} from "@/features/webshop/lib/shop-product"

const row = {
  id: "p1",
  name: "Shirt",
  shortDescription: null,
  price: 100,
  discount: 10,
  images: [],
  categoryId: null,
  productUrl: null,
  inventoryPolicy: "none",
  inventoryQuantity: 0,
  allowOutOfStockPurchase: false,
  vendor: "Acme",
} as unknown as Parameters<typeof toShopProduct>[0]

describe("shop product discount", () => {
  test("carries the product and vendor discounts stacked, as the cart charges", () => {
    const product = toShopProduct({ ...row, vendorDiscountPercent: 20 })
    expect(product.discount).toBeCloseTo(28)
    expect(discountedPrice(product, 100)).toBeCloseTo(72)
  })

  test("without a vendor discount it is the product's own", () => {
    expect(toShopProduct(row).discount).toBe(10)
  })
})
