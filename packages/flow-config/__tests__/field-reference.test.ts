import { describe, expect, test } from "vitest"
import {
  FieldReferenceKind,
  formatBotFieldReference,
  isBotFieldReference,
  isReservedFieldName,
  parseFieldReference,
  zodFieldName,
  zodFieldReference,
} from "../src/field-reference"

describe("parseFieldReference", () => {
  test("parses a legacy numeric id as a customField key", () => {
    expect(parseFieldReference("123")).toEqual({
      kind: FieldReferenceKind.customField,
      key: "123",
    })
  })

  test("parses a legacy plain name as a customField key", () => {
    expect(parseFieldReference("cf-birthday")).toEqual({
      kind: FieldReferenceKind.customField,
      key: "cf-birthday",
    })
  })

  test("parses a well-formed bot field token", () => {
    expect(parseFieldReference("bot_field:42")).toEqual({
      kind: FieldReferenceKind.botField,
      id: "42",
    })
  })

  test("falls back to customField for a malformed token with no id", () => {
    expect(parseFieldReference("bot_field:")).toEqual({
      kind: FieldReferenceKind.customField,
      key: "bot_field:",
    })
  })

  test("falls back to customField for a malformed token with a non-numeric id", () => {
    expect(parseFieldReference("bot_field:abc")).toEqual({
      kind: FieldReferenceKind.customField,
      key: "bot_field:abc",
    })
  })

  test("falls back to customField for a partially-numeric malformed token", () => {
    expect(parseFieldReference("bot_field:12x")).toEqual({
      kind: FieldReferenceKind.customField,
      key: "bot_field:12x",
    })
  })

  test("treats an empty string as a customField key", () => {
    expect(parseFieldReference("")).toEqual({
      kind: FieldReferenceKind.customField,
      key: "",
    })
  })
})

describe("formatBotFieldReference / parseFieldReference round-trip", () => {
  test("format then parse returns the original id", () => {
    const formatted = formatBotFieldReference("777")
    expect(formatted).toBe("bot_field:777")
    expect(parseFieldReference(formatted)).toEqual({
      kind: FieldReferenceKind.botField,
      id: "777",
    })
  })
})

describe("isBotFieldReference", () => {
  test("returns true for a well-formed token", () => {
    expect(isBotFieldReference("bot_field:1")).toBe(true)
  })

  test("returns false for a malformed token", () => {
    expect(isBotFieldReference("bot_field:")).toBe(false)
    expect(isBotFieldReference("bot_field:abc")).toBe(false)
  })

  test("returns false for a legacy name or id", () => {
    expect(isBotFieldReference("123")).toBe(false)
    expect(isBotFieldReference("cf-birthday")).toBe(false)
    expect(isBotFieldReference("")).toBe(false)
  })
})

describe("zodFieldReference", () => {
  const schema = zodFieldReference()

  test("accepts a legacy numeric id", () => {
    expect(schema.safeParse("123").success).toBe(true)
  })

  test("accepts a legacy name containing spaces", () => {
    expect(schema.safeParse("My Custom Field").success).toBe(true)
  })

  test("accepts a legacy name containing a colon", () => {
    expect(schema.safeParse("my:field").success).toBe(true)
  })

  test("accepts a well-formed bot field token", () => {
    expect(schema.safeParse("bot_field:123").success).toBe(true)
  })

  test("rejects an empty string", () => {
    expect(schema.safeParse("").success).toBe(false)
  })

  test("rejects a blank (whitespace-only) string", () => {
    expect(schema.safeParse("   ").success).toBe(false)
  })

  test("rejects a malformed reserved-prefix token with no id", () => {
    expect(schema.safeParse("bot_field:").success).toBe(false)
  })

  test("rejects a malformed reserved-prefix token with a non-numeric id", () => {
    expect(schema.safeParse("bot_field:abc").success).toBe(false)
  })
})

describe("reserved field name guard", () => {
  test("isReservedFieldName flags any bot_field: prefixed name", () => {
    expect(isReservedFieldName("bot_field:123")).toBe(true)
    expect(isReservedFieldName("bot_field:")).toBe(true)
    expect(isReservedFieldName("bot_field:anything")).toBe(true)
  })

  test("isReservedFieldName allows ordinary names", () => {
    expect(isReservedFieldName("Birthday")).toBe(false)
    expect(isReservedFieldName("bot_field")).toBe(false)
  })

  test("zodFieldName accepts an ordinary name", () => {
    expect(zodFieldName().safeParse("Birthday").success).toBe(true)
  })

  test("zodFieldName rejects a name colliding with the reference token shape", () => {
    expect(zodFieldName().safeParse("bot_field:123").success).toBe(false)
  })

  test("zodFieldName rejects an empty name", () => {
    expect(zodFieldName().safeParse("").success).toBe(false)
  })

  test("zodFieldName rejects a name over 255 characters", () => {
    expect(zodFieldName().safeParse("a".repeat(256)).success).toBe(false)
  })
})
