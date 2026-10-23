import { describe, expect, it } from "vitest"
import {
  computeLinePrice,
  formatMoney,
  getCurrencyFractionDigits,
  percentOf,
  roundMoney,
  sumMoney,
} from "../src/money"

describe("getCurrencyFractionDigits", () => {
  it("knows currencies without, with two and with three decimals", () => {
    expect(getCurrencyFractionDigits("JPY")).toBe(0)
    expect(getCurrencyFractionDigits("VND")).toBe(0)
    expect(getCurrencyFractionDigits("usd")).toBe(2)
    expect(getCurrencyFractionDigits("KWD")).toBe(3)
  })

  it("falls back to two decimals for a code it does not know", () => {
    expect(getCurrencyFractionDigits("not-a-code")).toBe(2)
  })
})

describe("roundMoney", () => {
  it("rounds a written-down half up instead of down", () => {
    expect(roundMoney(1.005, "USD")).toBe(1.01)
    expect(roundMoney(2.675, "USD")).toBe(2.68)
  })

  it("rounds to the currency's own unit", () => {
    expect(roundMoney(1234.5, "JPY")).toBe(1235)
    expect(roundMoney(1.0005, "KWD")).toBe(1.001)
  })

  it("rounds negative amounts away from zero", () => {
    expect(roundMoney(-1.005, "USD")).toBe(-1.01)
  })
})

describe("computeLinePrice", () => {
  it("applies the discount before the tax", () => {
    expect(
      computeLinePrice({
        unitPrice: 10,
        quantity: 3,
        discountPercent: 10,
        taxPercent: 10,
        currency: "USD",
      }),
    ).toEqual({ gross: 30, discountTotal: 3, taxTotal: 2.7, lineTotal: 29.7 })
  })

  it("defaults the discount and tax to none", () => {
    expect(
      computeLinePrice({ unitPrice: 50_000, quantity: 2, currency: "VND" }),
    ).toEqual({
      gross: 100_000,
      discountTotal: 0,
      taxTotal: 0,
      lineTotal: 100_000,
    })
  })

  it("rounds each part once so the parts add up to the total", () => {
    const line = computeLinePrice({
      unitPrice: 0.335,
      quantity: 3,
      discountPercent: 33,
      taxPercent: 7,
      currency: "USD",
    })
    expect(line.lineTotal).toBe(
      roundMoney(line.gross - line.discountTotal + line.taxTotal, "USD"),
    )
  })
})

describe("sumMoney and percentOf", () => {
  it("sums without floating-point drift", () => {
    expect(sumMoney([0.1, 0.2], "USD")).toBe(0.3)
  })

  it("takes a rounded percentage", () => {
    expect(percentOf(99.99, 5, "USD")).toBe(5)
  })
})

describe("formatMoney", () => {
  it("puts the symbol left or right, with or without a space", () => {
    expect(
      formatMoney(1234.5, { currency: "USD", symbol: "$", position: "left" }),
    ).toBe("$1,234.50")
    expect(
      formatMoney(5, { currency: "USD", symbol: "$", position: "leftSpace" }),
    ).toBe("$ 5.00")
    expect(
      formatMoney(125_000, { currency: "VND", symbol: "₫", position: "right" }),
    ).toBe("125,000₫")
    expect(
      formatMoney(125_000, {
        currency: "VND",
        symbol: "₫",
        position: "rightSpace",
      }),
    ).toBe("125,000 ₫")
  })

  it("falls back to the currency code without a symbol", () => {
    expect(formatMoney(5, { currency: "eur" })).toBe("EUR5.00")
  })

  it("puts the minus sign before the whole amount, in every position", () => {
    expect(
      formatMoney(-6.9, { currency: "USD", symbol: "$", position: "left" }),
    ).toBe("-$6.90")
    expect(
      formatMoney(-6.9, {
        currency: "USD",
        symbol: "$",
        position: "leftSpace",
      }),
    ).toBe("-$ 6.90")
    expect(
      formatMoney(-125_000, {
        currency: "VND",
        symbol: "₫",
        position: "right",
      }),
    ).toBe("-125,000₫")
    expect(
      formatMoney(-125_000, {
        currency: "VND",
        symbol: "₫",
        position: "rightSpace",
      }),
    ).toBe("-125,000 ₫")
    expect(formatMoney(-1234.5, { currency: "eur" })).toBe("-EUR1,234.50")
    expect(
      formatMoney(-1500, { currency: "JPY", symbol: "¥", position: "left" }),
    ).toBe("-¥1,500")
    expect(
      formatMoney(-12.345, {
        currency: "KWD",
        symbol: "KD",
        position: "leftSpace",
      }),
    ).toBe("-KD 12.345")
  })

  it("shows no sign for an amount that rounds to zero", () => {
    expect(
      formatMoney(-0.001, { currency: "USD", symbol: "$", position: "left" }),
    ).toBe("$0.00")
    expect(
      formatMoney(-0.4, { currency: "VND", symbol: "₫", position: "right" }),
    ).toBe("0₫")
  })
})
