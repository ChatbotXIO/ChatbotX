import { describe, expect, test } from "vitest"
import { containsVariablePlaceholder } from "../src/variables"
import { zodBigintAsString, zodUrlWithVariables } from "../src/zod"

describe("zodBigintAsString", () => {
  const schema = zodBigintAsString()

  test.each(["123", "0"])("accepts %j", (value) => {
    expect(schema.safeParse(value).success).toBe(true)
  })

  // Anchored so a value with a non-numeric run anywhere is rejected, not just
  // one that lacks digits entirely — ids are numeric snowflakes (createId),
  // never a mixed string.
  test.each(["abc123", "12a", "", " 12"])("rejects %j", (value) => {
    expect(schema.safeParse(value).success).toBe(false)
  })
})

describe("containsVariablePlaceholder", () => {
  // Mirrors the runtime resolver grammar (`@chatbotx.io/variables`), which
  // matches any run of non-brace/non-newline characters and trims surrounding
  // whitespace — so `{{ domain }}` is a placeholder the resolver handles.
  test.each([
    "{{booking_link}}",
    "https://example.com/{{id}}",
    "{{raw:field}}",
    "{{coupon:SUMMER}}",
    "{{ domain }}",
  ])("detects a placeholder in %j", (value) => {
    expect(containsVariablePlaceholder(value)).toBe(true)
  })

  // A token cannot span braces or a newline, and there is no token at all, so
  // these are not placeholders.
  test.each([
    "https://example.com",
    "adasdad",
    "{{",
    "}}",
    "{{\n}}",
    "",
  ])("returns false for %j", (value) => {
    expect(containsVariablePlaceholder(value)).toBe(false)
  })
})

describe("zodUrlWithVariables", () => {
  const schema = zodUrlWithVariables()

  test.each([
    "https://example.com",
    "https://example.com/path?x=1",
    "{{booking_link}}",
    "https://example.com/{{id}}",
    "https://{{domain}}.com",
    "{{ domain }}",
  ])("accepts %j", (value) => {
    expect(schema.safeParse(value).success).toBe(true)
  })

  test.each([
    "adasdad",
    "not a url",
    "{{",
    "{{\n}}",
    "",
  ])("rejects %j", (value) => {
    const result = schema.safeParse(value)
    expect(result.success).toBe(false)
  })

  test("reports the default Invalid URL message", () => {
    const result = schema.safeParse("adasdad")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid URL")
    }
  })

  test("honors a custom message", () => {
    const result = zodUrlWithVariables("Bad link").safeParse("nope")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Bad link")
    }
  })
})
