import { describe, expect, it } from "vitest"
import { validateCustomFieldValue } from "../src/default/handlers/imports/validations/custom-field-value"

describe("validateCustomFieldValue", () => {
  describe("shortText / longText", () => {
    it("keeps non-empty string", () => {
      expect(validateCustomFieldValue("shortText", "hello")).toBe("hello")
      expect(validateCustomFieldValue("longText", "long body")).toBe(
        "long body",
      )
    })
    it("drops empty", () => {
      expect(validateCustomFieldValue("shortText", "")).toBeNull()
    })
  })

  describe("email", () => {
    it("normalizes to lowercase", () => {
      expect(validateCustomFieldValue("email", "Foo@Bar.COM")).toBe(
        "foo@bar.com",
      )
    })
    it("drops invalid", () => {
      expect(validateCustomFieldValue("email", "not-an-email")).toBeNull()
    })
  })

  describe("phoneNumber", () => {
    it("strips formatting, preserves +", () => {
      expect(validateCustomFieldValue("phoneNumber", "+1 (555) 123-4567")).toBe(
        "+15551234567",
      )
    })
    it("drops invalid", () => {
      expect(validateCustomFieldValue("phoneNumber", "abc")).toBeNull()
      expect(validateCustomFieldValue("phoneNumber", "123")).toBeNull()
    })
  })

  describe("number", () => {
    it.each([
      ["123", "123"],
      ["-42.5", "-42.5"],
      ["0", "0"],
      ["1.5e2", "150"],
    ])("accepts %s → %s", (raw, normalized) => {
      expect(validateCustomFieldValue("number", raw)).toBe(normalized)
    })
    it.each([
      ["abc"],
      ["12abc"],
      ["'=123"],
      [""],
      ["NaN"],
      ["Infinity"],
    ])("drops %s", (raw) => {
      expect(validateCustomFieldValue("number", raw)).toBeNull()
    })
  })

  describe("boolean", () => {
    it.each([
      ["true", "true"],
      ["TRUE", "true"],
      ["1", "true"],
      ["false", "false"],
      ["FALSE", "false"],
      ["0", "false"],
    ])("normalizes %s → %s", (raw, normalized) => {
      expect(validateCustomFieldValue("boolean", raw)).toBe(normalized)
    })
    it.each([["yes"], ["no"], ["t"], ["'=true"], [""]])("drops %s", (raw) => {
      expect(validateCustomFieldValue("boolean", raw)).toBeNull()
    })
  })

  describe("date", () => {
    it("accepts YYYY-MM-DD", () => {
      expect(validateCustomFieldValue("date", "2026-05-19")).toBe("2026-05-19")
    })
    it.each([
      ["05/19/2026"],
      ["2026-05-19T10:00:00Z"],
      ["'=2026-05-19"],
      ["2026-13-01"],
    ])("drops %s", (raw) => {
      expect(validateCustomFieldValue("date", raw)).toBeNull()
    })
  })

  describe("datetime", () => {
    it("normalizes to ISO", () => {
      const result = validateCustomFieldValue(
        "datetime",
        "2026-05-19T10:00:00Z",
      )
      expect(result).toBe("2026-05-19T10:00:00.000Z")
    })
    it.each([
      ["2026-05-19"],
      ["not-a-date"],
      ["'=2026-05-19T10:00:00Z"],
    ])("drops %s", (raw) => {
      expect(validateCustomFieldValue("datetime", raw)).toBeNull()
    })
  })
})
