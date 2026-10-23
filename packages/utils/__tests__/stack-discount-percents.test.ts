import { describe, expect, test } from "vitest"
import { stackDiscountPercents } from "../src/money"

describe("stackDiscountPercents", () => {
  test("stacks the product and vendor discounts", () => {
    expect(stackDiscountPercents(10, 20)).toBeCloseTo(28)
  })

  test("is the other discount alone when one is 0", () => {
    expect(stackDiscountPercents(0, 15)).toBe(15)
    expect(stackDiscountPercents(15, 0)).toBe(15)
  })

  test("never goes past 100", () => {
    expect(stackDiscountPercents(100, 50)).toBe(100)
  })
})
