import { describe, expect, test } from "vitest"
import { PaymentProviderError } from "../src/errors"
import {
  formatPaypalValue,
  isPaypalCurrency,
  parsePaypalValue,
  toPaypalMinorUnits,
  toStripeMinorUnits,
} from "../src/minor-units"

const expectUnsupported = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentProviderError)
    expect((error as PaymentProviderError).kind).toBe("amountUnsupported")
    return
  }
  throw new Error("expected amountUnsupported")
}

describe("toStripeMinorUnits", () => {
  test.each([
    [12.5, "USD", 1250],
    [0.1 + 0.2, "EUR", 30],
    [19.99, "usd", 1999],
    [150_000, "VND", 150_000],
    [500, "JPY", 500],
    [5, "ISK", 500],
    [5, "UGX", 500],
    [1.23, "KWD", 1230],
    [10.45, "HUF", 1045],
  ])("%s %s is %s", (amount, currency, minor) => {
    expect(toStripeMinorUnits(amount, currency)).toBe(minor)
  })

  test.each([
    [12.345, "USD"],
    [150_000.5, "VND"],
    [5.5, "ISK"],
    // Three-decimal currencies only take amounts whose last digit is 0.
    [1.234, "KWD"],
    [0, "USD"],
    [-5, "USD"],
    [Number.NaN, "USD"],
  ])("refuses %s %s instead of rounding", (amount, currency) => {
    expectUnsupported(() => toStripeMinorUnits(amount, currency))
  })
})

describe("PayPal amounts", () => {
  test("takes only the currencies PayPal supports", () => {
    expect(isPaypalCurrency("usd")).toBe(true)
    expect(isPaypalCurrency("VND")).toBe(false)
    expectUnsupported(() => toPaypalMinorUnits(150_000, "VND"))
  })

  test.each([
    [12.5, "USD", 1250, "12.50"],
    [0.05, "EUR", 5, "0.05"],
    [1000, "JPY", 1000, "1000"],
    [2500, "HUF", 2500, "2500"],
  ])("%s %s is %s minor, sent as %s", (amount, currency, minor, value) => {
    expect(toPaypalMinorUnits(amount, currency)).toBe(minor)
    expect(formatPaypalValue(minor, currency)).toBe(value)
    expect(parsePaypalValue(value, currency)).toBe(minor)
  })

  test("refuses decimals PayPal does not take", () => {
    expectUnsupported(() => toPaypalMinorUnits(10.5, "HUF"))
    expectUnsupported(() => toPaypalMinorUnits(10.555, "USD"))
  })

  test("reads PayPal's amounts exactly, without floats", () => {
    expect(parsePaypalValue("10", "USD")).toBe(1000)
    expect(parsePaypalValue("10.5", "USD")).toBe(1050)
    expect(parsePaypalValue("10.50", "USD")).toBe(1050)
    expect(parsePaypalValue("0.10", "USD")).toBe(10)
    expect(() => parsePaypalValue("10.501", "USD")).toThrow(
      PaymentProviderError,
    )
    expect(() => parsePaypalValue("abc", "USD")).toThrow(PaymentProviderError)
  })
})
