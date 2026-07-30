import { describe, expect, test } from "vitest"
import {
  matchProductImportHeaders,
  normalizeProductHeader,
} from "../src/modules/products/header-match"

describe("product import header matching", () => {
  test.each([
    ["Tên sản phẩm", "name"],
    ["TÊN SẢN PHẨM ", "name"],
    ["Mã sản phẩm", "sku"],
    ["SKU", "sku"],
    ["Giá bán", "price"],
    ["Price", "price"],
    ["Product URL", "productUrl"],
    ["Link sản phẩm", "productUrl"],
  ])("maps %s to %s", (header, field) => {
    expect(matchProductImportHeaders([header])).toHaveProperty(field, header)
  })

  test("does not guess an unsupported header", () => {
    expect(matchProductImportHeaders(["Đơn vị tính"])).toEqual({})
  })

  test("uses a duplicate source header only once", () => {
    const mapping = matchProductImportHeaders(["SKU", "SKU"])
    expect(Object.values(mapping)).toEqual(["SKU"])
  })

  test.each([
    ["đ", "d"],
    ["Đ", "d"],
    ["Đơn vị", "donvi"],
  ])("normalizes Vietnamese d variants in %s", (header, normalized) => {
    expect(normalizeProductHeader(header)).toBe(normalized)
  })
})
