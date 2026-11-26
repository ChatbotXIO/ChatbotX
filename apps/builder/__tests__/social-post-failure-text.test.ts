import { describe, expect, test } from "vitest"
import { failureText } from "@/features/social-posts/lib/quota-message"

const t = (key: string) => `translated:${key}`
const text = (errorCode: string | null, errorMessage = "stored message") =>
  failureText({ errorCode, errorMessage }, t as never)

describe("failureText", () => {
  test.each([
    ["postMessageQuotaExceeded", "composer.postMessageQuotaExceeded"],
    ["removalPermissionMissing", "composer.removalPermissionMissing"],
    ["removalQueueFailed", "composer.removalQueueFailed"],
  ])("translates the %s code", (code, key) => {
    expect(text(code)).toBe(`translated:${key}`)
  })

  test("falls back to the stored message for any other code", () => {
    expect(text("removalUnsupported")).toBe("stored message")
    expect(text(null)).toBe("stored message")
    expect(text("toString")).toBe("stored message")
  })
})
