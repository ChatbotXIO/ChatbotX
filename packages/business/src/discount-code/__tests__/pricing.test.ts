import { describe, expect, test } from "vitest"
import {
  assertCouponUsable,
  type CouponLine,
  type CouponRules,
  computeCouponDiscount,
} from "../pricing"

const rules = (overrides: Partial<CouponRules> = {}): CouponRules => ({
  discountType: "percentage",
  discountValue: 20,
  appliesTo: "entireOrder",
  categoryId: null,
  productIds: [],
  minimumType: "none",
  minimumValue: 0,
  ...overrides,
})

const lines: CouponLine[] = [
  {
    productId: "p1",
    categoryIds: ["shirts", "summer"],
    amount: 30,
    quantity: 3,
  },
  { productId: "p2", categoryIds: ["hats"], amount: 20, quantity: 1 },
]

const order = (overrides: Record<string, unknown> = {}) => ({
  lines,
  shippingType: "delivery" as const,
  shippingTotal: 5,
  currency: "USD",
  ...overrides,
})

describe("computeCouponDiscount", () => {
  test("a percentage of the whole order", () => {
    expect(computeCouponDiscount(rules(), order())).toBe(10)
  })

  test("a percentage of one category, sub-categories included", () => {
    expect(
      computeCouponDiscount(
        rules({ appliesTo: "category", categoryId: "summer" }),
        order(),
      ),
    ).toBe(6)
  })

  test("a percentage of chosen products", () => {
    expect(
      computeCouponDiscount(
        rules({ appliesTo: "products", productIds: ["p2"] }),
        order(),
      ),
    ).toBe(4)
  })

  test("a fixed amount never takes more than the lines it applies to", () => {
    expect(
      computeCouponDiscount(
        rules({
          discountType: "fixedAmount",
          discountValue: 100,
          appliesTo: "products",
          productIds: ["p2"],
        }),
        order(),
      ),
    ).toBe(20)
  })

  test("free shipping takes the delivery cost off", () => {
    expect(
      computeCouponDiscount(rules({ discountType: "freeShipping" }), order()),
    ).toBe(5)
  })

  test("free shipping does not apply to pickup", () => {
    expect(() =>
      computeCouponDiscount(
        rules({ discountType: "freeShipping" }),
        order({ shippingType: "pickup", shippingTotal: 0 }),
      ),
    ).toThrow(expect.objectContaining({ code: "discountCodeNotApplicable" }))
  })

  test("a code for products not in the order does not apply", () => {
    expect(() =>
      computeCouponDiscount(
        rules({ appliesTo: "products", productIds: ["p9"] }),
        order(),
      ),
    ).toThrow(expect.objectContaining({ code: "discountCodeNotApplicable" }))
  })

  test("the minimum amount is read on the lines the code applies to", () => {
    expect(() =>
      computeCouponDiscount(
        rules({
          appliesTo: "category",
          categoryId: "hats",
          minimumType: "amount",
          minimumValue: 25,
        }),
        order(),
      ),
    ).toThrow(
      expect.objectContaining({
        code: "discountCodeMinimumNotMet",
        data: { minimumType: "amount", minimum: 25, missing: 5 },
      }),
    )
  })

  test("the minimum number of items", () => {
    expect(() =>
      computeCouponDiscount(
        rules({ minimumType: "quantity", minimumValue: 5 }),
        order(),
      ),
    ).toThrow(
      expect.objectContaining({
        code: "discountCodeMinimumNotMet",
        data: { minimumType: "quantity", minimum: 5, missing: 1 },
      }),
    )
    expect(
      computeCouponDiscount(
        rules({ minimumType: "quantity", minimumValue: 4 }),
        order(),
      ),
    ).toBe(10)
  })

  test("rounds to the currency's decimals", () => {
    expect(
      computeCouponDiscount(
        rules({ discountValue: 15 }),
        order({
          lines: [
            { productId: "p1", categoryIds: [], amount: 33_333, quantity: 1 },
          ],
          currency: "VND",
        }),
      ),
    ).toBe(5000)
  })
})

describe("assertCouponUsable", () => {
  const now = new Date("2026-10-21T10:00:00Z")
  const state = (overrides: Record<string, unknown> = {}) => ({
    isActive: true,
    startsAt: new Date("2026-10-01T00:00:00Z"),
    endsAt: null,
    usageLimit: null,
    usedCount: 0,
    ...overrides,
  })

  test.each([
    [{ isActive: false }, "discountCodeInactive"],
    [{ startsAt: new Date("2026-11-01T00:00:00Z") }, "discountCodeNotStarted"],
    [{ endsAt: new Date("2026-10-21T10:00:00Z") }, "discountCodeExpired"],
    [{ usageLimit: 3, usedCount: 3 }, "discountCodeUsageLimitReached"],
  ])("refuses %o", (overrides, code) => {
    expect(() => assertCouponUsable(state(overrides), now)).toThrow(
      expect.objectContaining({ code }),
    )
  })

  test("a code on, within its dates and with a use left", () => {
    expect(() =>
      assertCouponUsable(state({ usageLimit: 3, usedCount: 2 }), now),
    ).not.toThrow()
  })
})
