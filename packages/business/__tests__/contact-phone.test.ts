import { describe, expect, test } from "vitest"
import {
  normalizeIdentityPhoneToE164,
  normalizePhoneToE164,
  resolveDefaultRegion,
} from "../src/contact/phone"

describe("resolveDefaultRegion", () => {
  test("uses the workspace country when it is known", () => {
    expect(resolveDefaultRegion("VN")).toBe("VN")
  })

  test.each([
    null,
    undefined,
    "",
    "unknown",
  ])("has no region for %j, so numbers must carry a +", (country) => {
    expect(resolveDefaultRegion(country)).toBeUndefined()
  })
})

describe("normalizePhoneToE164", () => {
  test("keeps an international number and strips separators", () => {
    expect(normalizePhoneToE164("+84 901-234-567", null)).toBe("+84901234567")
  })

  test("reads a local number against the workspace country", () => {
    expect(normalizePhoneToE164("0901234567", "VN")).toBe("+84901234567")
  })

  test("an explicit country code beats the workspace country", () => {
    expect(normalizePhoneToE164("+15551234567", "VN")).toBe("+15551234567")
  })

  test("rejects a local number when no country is known", () => {
    expect(normalizePhoneToE164("0901234567", null)).toBeNull()
  })

  test.each(["", "abc", "+"])("rejects %j", (raw) => {
    expect(normalizePhoneToE164(raw, "VN")).toBeNull()
  })
})

describe("normalizeIdentityPhoneToE164 (webhook identity)", () => {
  test("keeps reading a valid local number in the workspace country", () => {
    expect(normalizeIdentityPhoneToE164("0901234567", "VN")).toBe(
      "+84901234567",
    )
  })

  test("reads a bare-digits wa_id as international, not as a national number", () => {
    expect(normalizeIdentityPhoneToE164("447911123456", "VN")).toBe(
      "+447911123456",
    )
    expect(normalizeIdentityPhoneToE164("84901234567", "US")).toBe(
      "+84901234567",
    )
  })

  test("a same-country wa_id wins over a bogus national reading (variable-length plans like DE)", () => {
    expect(normalizeIdentityPhoneToE164("4915112345678", "DE")).toBe(
      "+4915112345678",
    )
    expect(normalizeIdentityPhoneToE164("4917612345678", "DE")).toBe(
      "+4917612345678",
    )
    expect(normalizeIdentityPhoneToE164("491701234567", "DE")).toBe(
      "+491701234567",
    )
  })

  test.each([
    ["VN", "846366595", "+84846366595"],
    ["BR", "55991234567", "+5555991234567"],
    ["BR", "5532123456", "+555532123456"],
    ["IN", "9118772020", "+919118772020"],
  ])("a %s local number %s that merely looks like +<calling code>… keeps its national reading", (country, local, expected) => {
    expect(normalizeIdentityPhoneToE164(local, country)).toBe(expected)
  })

  test.each([
    ["VN", "84901234567", "+84901234567"],
    ["BR", "5511987654321", "+5511987654321"],
    ["IN", "919876543210", "+919876543210"],
    ["US", "14155552671", "+14155552671"],
  ])("a same-country %s mobile wa_id %s is international", (country, waId, expected) => {
    expect(normalizeIdentityPhoneToE164(waId, country)).toBe(expected)
  })

  test("a local number still reads as national when its international reading is another country", () => {
    expect(normalizeIdentityPhoneToE164("2025550123", "US")).toBe(
      "+12025550123",
    )
  })

  test("works without a workspace country", () => {
    expect(normalizeIdentityPhoneToE164("84901234567", null)).toBe(
      "+84901234567",
    )
    expect(normalizeIdentityPhoneToE164("84901234567", "unknown")).toBe(
      "+84901234567",
    )
  })

  test("accepts a number that already carries a +", () => {
    expect(normalizeIdentityPhoneToE164("+84 901 234 567", "US")).toBe(
      "+84901234567",
    )
  })

  test("still rejects junk", () => {
    expect(normalizeIdentityPhoneToE164("abc", "VN")).toBeNull()
    expect(normalizeIdentityPhoneToE164("", "VN")).toBeNull()
  })
})
