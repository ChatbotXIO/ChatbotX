import { describe, expect, test } from "vitest"
import { formatErrorContent } from "@/features/common/lib/format-error-content"

describe("formatErrorContent", () => {
  test("returns the message from a JSON error payload", () => {
    expect(
      formatErrorContent(JSON.stringify({ message: "Rate limited" })),
    ).toBe("Rate limited")
  })

  test("returns raw JSON when message is missing", () => {
    const raw = JSON.stringify({ code: "BAD_REQUEST" })

    expect(formatErrorContent(raw)).toBe(raw)
  })

  test("returns raw JSON when message is empty", () => {
    const raw = JSON.stringify({ message: "   " })

    expect(formatErrorContent(raw)).toBe(raw)
  })

  test("returns raw content when the payload is not JSON", () => {
    expect(formatErrorContent("plain failure")).toBe("plain failure")
  })
})
