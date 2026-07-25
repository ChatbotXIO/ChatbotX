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
    ])("accepts %s -> %s", (raw, normalized) => {
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
    ])("normalizes %s -> %s", (raw, normalized) => {
      expect(validateCustomFieldValue("boolean", raw)).toBe(normalized)
    })

    it.each([["yes"], ["no"], ["t"], ["'=true"], [""]])("drops %s", (raw) => {
      expect(validateCustomFieldValue("boolean", raw)).toBeNull()
    })
  })

  describe("date", () => {
    it("normalizes YYYY-MM-DD offset-preserved using the supplied timezone", () => {
      expect(
        validateCustomFieldValue("date", "2026-07-22", "Asia/Ho_Chi_Minh"),
      ).toBe("2026-07-22T00:00:00+07:00")
    })

    it("uses only the date part when time or offset is present", () => {
      expect(
        validateCustomFieldValue(
          "date",
          "2026-05-19T10:00:00Z",
          "Asia/Ho_Chi_Minh",
        ),
      ).toBe("2026-05-19T00:00:00+07:00")
    })

    it("preserves strict date behavior for offset-bearing values crossing timezone days", () => {
      expect(
        validateCustomFieldValue(
          "date",
          "2026-05-19T23:30:00-04:00",
          "Asia/Ho_Chi_Minh",
        ),
      ).toBe("2026-05-19T00:00:00+07:00")
    })

    it.each([
      ["23/07/2026", "2026-07-23T00:00:00+07:00"],
      ["07/23/2026", "2026-07-23T00:00:00+07:00"],
      ["23 tháng 7 năm 2026", "2026-07-23T00:00:00+07:00"],
      ["Jul 23, 2026", "2026-07-23T00:00:00+07:00"],
      ["1700000000", "2023-11-15T00:00:00+07:00"],
    ])("normalizes import date %s -> %s", (raw, normalized) => {
      expect(validateCustomFieldValue("date", raw, "Asia/Ho_Chi_Minh")).toBe(
        normalized,
      )
    })

    it.each([
      ["'=2026-05-19"],
      ["2026-13-01"],
      ["45497"],
    ])("drops %s", (raw) => {
      expect(
        validateCustomFieldValue("date", raw, "Asia/Ho_Chi_Minh"),
      ).toBeNull()
    })
  })

  describe("datetime", () => {
    it("normalizes naive values using the supplied timezone", () => {
      expect(
        validateCustomFieldValue(
          "datetime",
          "2026-07-22 15:30",
          "Asia/Ho_Chi_Minh",
        ),
      ).toBe("2026-07-22T08:30:00.000Z")
    })

    it("passes through offset-bearing values", () => {
      expect(
        validateCustomFieldValue(
          "datetime",
          "2026-07-22T15:30:00+07:00",
          "America/New_York",
        ),
      ).toBe("2026-07-22T08:30:00.000Z")
    })

    it("preserves strict datetime behavior for fractional ISO values", () => {
      expect(
        validateCustomFieldValue(
          "datetime",
          "2026-07-23T09:30:00.123",
          "Asia/Ho_Chi_Minh",
        ),
      ).toBe("2026-07-23T02:30:00.123Z")
    })

    it.each([
      ["23/07/2026 09:30", "2026-07-23T02:30:00.000Z"],
      ["07/23/2026 09:30", "2026-07-23T02:30:00.000Z"],
      ["ngày 23 tháng 7 năm 2026 lúc 09:30:45", "2026-07-23T02:30:45.000Z"],
      ["Jul 23, 2026 9:30 AM", "2026-07-23T02:30:00.000Z"],
      ["1721800800", "2024-07-24T06:00:00.000Z"],
    ])("normalizes import datetime %s -> %s", (raw, normalized) => {
      expect(
        validateCustomFieldValue("datetime", raw, "Asia/Ho_Chi_Minh"),
      ).toBe(normalized)
    })

    it.each([
      ["not-a-date"],
      ["'=2026-05-19T10:00:00Z"],
      ["2026"],
    ])("drops %s", (raw) => {
      expect(validateCustomFieldValue("datetime", raw)).toBeNull()
    })
  })
})
