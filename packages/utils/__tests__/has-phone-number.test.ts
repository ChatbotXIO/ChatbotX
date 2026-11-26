import { describe, expect, test } from "vitest"
import {
  findPhoneNumber,
  hasPhoneNumber,
  PHONE_NUMBER_SQL_PATTERN,
  REDACTED_PHONE_NUMBER,
  redactPhoneNumbers,
} from "../src/has-phone-number"

describe("hasPhoneNumber", () => {
  test.each([
    "0912345678",
    "0912 345 678",
    "call me on 0912-345-678 please",
    "(028) 3822 1234",
    "+84 912 345 678",
    "+1 (415) 555-0132",
    "zalo 091.234.5678",
  ])("flags %s", (text) => {
    expect(hasPhoneNumber(text)).toBe(true)
  })

  test.each([
    "",
    "nice shop",
    "order 12345",
    "call 12345",
    "1234567",
    "price 99",
  ])("does not flag %j", (text) => {
    expect(hasPhoneNumber(text)).toBe(false)
  })
})

// Pinned on purpose: the rule is shared with Comment Automation's hide switch,
// so changing what it matches is a product decision, not a side effect.
describe("hasPhoneNumber known loose matches", () => {
  test.each([
    "2026-11-22",
    "giá 1.500.000đ",
    "order #12345678",
    "ship 2 cái 350.000 + 30.000",
  ])("still matches %j", (text) => {
    expect(hasPhoneNumber(text)).toBe(true)
  })
})

describe("redactPhoneNumbers", () => {
  test("masks every run hasPhoneNumber flags and leaves the rest", () => {
    expect(redactPhoneNumbers("call 0912 345 678 or +84 912.345.678 now")).toBe(
      `call ${REDACTED_PHONE_NUMBER} or ${REDACTED_PHONE_NUMBER} now`,
    )
  })

  test("text without a phone number is unchanged", () => {
    expect(redactPhoneNumbers("nice shop, order 12345")).toBe(
      "nice shop, order 12345",
    )
  })

  test("nothing flagged survives the mask", () => {
    for (const text of ["0912345678", "zalo 091.234.5678", "2026-11-22"]) {
      expect(hasPhoneNumber(redactPhoneNumbers(text))).toBe(false)
    }
  })
})

describe("PHONE_NUMBER_SQL_PATTERN", () => {
  // The POSIX class [:space:] is the only construct JavaScript spells differently.
  const asJavaScript = new RegExp(
    PHONE_NUMBER_SQL_PATTERN.replace("[:space:]", "\\s"),
  )

  test.each([
    "0912345678",
    "0912 345 678",
    "+84 912 345 678",
    "(028) 3822 1234",
    "2026-11-22",
    "1.500.000",
    "",
    "nice shop",
    "order 12345",
    "1234567",
    "price 99",
  ])("agrees with hasPhoneNumber on %j", (text) => {
    expect(asJavaScript.test(text)).toBe(hasPhoneNumber(text))
  })
})

describe("findPhoneNumber", () => {
  test("returns the first flagged run without surrounding spaces", () => {
    expect(findPhoneNumber("call me on 0912 345 678 please")).toBe(
      "0912 345 678",
    )
    expect(findPhoneNumber("+84 912 345 678")).toBe("+84 912 345 678")
  })

  test("is null when there is none", () => {
    expect(findPhoneNumber("nice shop")).toBeNull()
    expect(findPhoneNumber("")).toBeNull()
  })
})
