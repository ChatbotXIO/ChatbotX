import { describe, expect, test } from "vitest"
import type { ChatbotXException } from "../src/errors"
import { toValidatedCustomFieldValue } from "../src/javascript-execution/output-value"

const validate = (props: Parameters<typeof toValidatedCustomFieldValue>[0]) =>
  toValidatedCustomFieldValue(props)

describe("toValidatedCustomFieldValue", () => {
  test("skips the write for null or undefined", () => {
    expect(
      validate({ value: null, type: "number", fieldName: "Age" }),
    ).toBeNull()
    expect(
      validate({ value: undefined, type: "number", fieldName: "Age" }),
    ).toBeNull()
  })

  describe("number", () => {
    test("accepts a finite JS number", () => {
      expect(validate({ value: 42, type: "number", fieldName: "Age" })).toBe(
        "42",
      )
    })

    test("accepts a numeric string", () => {
      expect(validate({ value: "42", type: "number", fieldName: "Age" })).toBe(
        "42",
      )
    })

    test("rejects a non-numeric string", () => {
      expect(() =>
        validate({ value: "Abcd 123", type: "number", fieldName: "Age" }),
      ).toThrowError(
        expect.objectContaining<Partial<ChatbotXException>>({
          code: "javascriptOutputTypeMismatch",
        }),
      )
    })

    test("rejects NaN and Infinity instead of persisting the JSON.stringify null", () => {
      expect(() =>
        validate({
          value: Number.NaN,
          type: "number",
          fieldName: "Age",
        }),
      ).toThrowError(
        expect.objectContaining<Partial<ChatbotXException>>({
          code: "javascriptOutputTypeMismatch",
        }),
      )
      expect(() =>
        validate({
          value: Number.POSITIVE_INFINITY,
          type: "number",
          fieldName: "Age",
        }),
      ).toThrowError(
        expect.objectContaining<Partial<ChatbotXException>>({
          code: "javascriptOutputTypeMismatch",
        }),
      )
    })

    test("rejects an object", () => {
      expect(() =>
        validate({ value: { a: 1 }, type: "number", fieldName: "Age" }),
      ).toThrowError(
        expect.objectContaining<Partial<ChatbotXException>>({
          code: "javascriptOutputTypeMismatch",
        }),
      )
    })
  })

  describe("boolean", () => {
    test("accepts a JS boolean", () => {
      expect(
        validate({ value: true, type: "boolean", fieldName: "Active" }),
      ).toBe("true")
    })

    test("accepts canonical string forms", () => {
      expect(
        validate({ value: "1", type: "boolean", fieldName: "Active" }),
      ).toBe("true")
      expect(
        validate({ value: "0", type: "boolean", fieldName: "Active" }),
      ).toBe("false")
    })

    test("rejects a non-boolean-like string", () => {
      expect(() =>
        validate({ value: "garbage", type: "boolean", fieldName: "Active" }),
      ).toThrowError(
        expect.objectContaining<Partial<ChatbotXException>>({
          code: "javascriptOutputTypeMismatch",
        }),
      )
    })
  })

  describe("email", () => {
    test("lowercases a valid email", () => {
      expect(
        validate({
          value: "Foo@Bar.COM",
          type: "email",
          fieldName: "Email",
        }),
      ).toBe("foo@bar.com")
    })

    test("rejects a non-string value", () => {
      expect(() =>
        validate({ value: 42, type: "email", fieldName: "Email" }),
      ).toThrowError(
        expect.objectContaining<Partial<ChatbotXException>>({
          code: "javascriptOutputTypeMismatch",
        }),
      )
    })
  })

  describe("phoneNumber", () => {
    test("strips formatting, preserves +", () => {
      expect(
        validate({
          value: "+1 (555) 123-4567",
          type: "phoneNumber",
          fieldName: "Phone",
        }),
      ).toBe("+15551234567")
    })
  })

  describe("date / datetime", () => {
    test("hands a parseable value through raw", () => {
      expect(
        validate({
          value: "2026-07-22T10:00:00Z",
          type: "datetime",
          fieldName: "Signed up",
        }),
      ).toBe("2026-07-22T10:00:00Z")
    })

    test("rejects an unparseable value", () => {
      expect(() =>
        validate({
          value: "not a date",
          type: "datetime",
          fieldName: "Signed up",
        }),
      ).toThrowError(
        expect.objectContaining<Partial<ChatbotXException>>({
          code: "javascriptOutputTypeMismatch",
        }),
      )
    })
  })

  describe("shortText / longText", () => {
    test("stringifies objects and arrays unchanged", () => {
      expect(
        validate({
          value: { a: 1 },
          type: "shortText",
          fieldName: "Note",
        }),
      ).toBe(JSON.stringify({ a: 1 }))
    })

    test("accepts an empty string", () => {
      expect(
        validate({ value: "", type: "shortText", fieldName: "Note" }),
      ).toBe("")
    })
  })

  test("throws for an empty string into a non-text field", () => {
    expect(() =>
      validate({ value: "", type: "number", fieldName: "Age" }),
    ).toThrowError(
      expect.objectContaining<Partial<ChatbotXException>>({
        code: "javascriptOutputTypeMismatch",
      }),
    )
  })

  test("throws javascriptOutputValueTooLarge before the type check", () => {
    expect(() =>
      validate({
        value: "a".repeat(64 * 1024 + 1),
        type: "number",
        fieldName: "Age",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ChatbotXException>>({
        code: "javascriptOutputValueTooLarge",
      }),
    )
  })
})
