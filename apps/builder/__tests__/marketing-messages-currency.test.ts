import { describe, expect, test } from "vitest"
import {
  currencyOffset,
  minBudgetMajorUnits,
  toMinorUnits,
} from "@/features/facebook-marketing-messages/lib/currency"

describe("currencyOffset", () => {
  test("defaults to 100", () => {
    expect(currencyOffset("USD")).toBe(100)
    expect(currencyOffset("EUR")).toBe(100)
  })

  test.each([
    "CLP",
    "COP",
    "CRC",
    "HUF",
    "IDR",
    "ISK",
    "JPY",
    "KRW",
    "PYG",
    "TWD",
    "VND",
  ])("%s has offset 1", (currency) => {
    expect(currencyOffset(currency)).toBe(1)
  })

  test("is case-insensitive", () => {
    expect(currencyOffset("jpy")).toBe(1)
  })
})

describe("toMinorUnits", () => {
  test("multiplies by 100 for a default-offset currency", () => {
    expect(toMinorUnits(30, "USD")).toBe(3000)
  })

  test("does not multiply a zero-decimal currency", () => {
    expect(toMinorUnits(1000, "JPY")).toBe(1000)
    expect(toMinorUnits(50_000, "VND")).toBe(50_000)
  })

  test("rounds away floating-point drift", () => {
    expect(toMinorUnits(19.99, "USD")).toBe(1999)
    expect(toMinorUnits(0.29, "USD")).toBe(29)
  })
})

describe("minBudgetMajorUnits", () => {
  test("is the smallest representable positive amount", () => {
    expect(minBudgetMajorUnits("USD")).toBe(0.01)
    expect(minBudgetMajorUnits("JPY")).toBe(1)
  })
})
