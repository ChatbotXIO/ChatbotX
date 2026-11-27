import { describe, expect, test } from "vitest"
import { primaryCurrencyForCountry } from "../src/country-currency"

describe("primaryCurrencyForCountry", () => {
  test.each([
    ["VN", "VND"],
    ["JP", "JPY"],
    ["US", "USD"],
    ["vn", "VND"],
    [" jp ", "JPY"],
  ])("%s → %s", (code, currency) => {
    expect(primaryCurrencyForCountry(code)).toBe(currency)
  })

  test("takes the first of several currencies", () => {
    expect(primaryCurrencyForCountry("CH")).toBe("CHF")
  })

  test.each([
    ["unknown"],
    ["ZZ"],
    [""],
    [null],
    [undefined],
    ["AQ"],
  ])("%s has no currency", (code) => {
    expect(primaryCurrencyForCountry(code)).toBeNull()
  })
})
