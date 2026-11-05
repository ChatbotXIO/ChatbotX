import { describe, expect, test } from "vitest"
import { safeHttpUrl } from "@/features/templates/lib/safe-http-url"
import { saveTemplateRequest } from "@/features/templates/schema/mutation"

// The publisher's "test link" is rendered as an href on the public share page,
// so anything but http(s) would run in every visitor's browser.
describe("template test link", () => {
  test.each([
    ["https://example.com/demo", "https://example.com/demo"],
    ["http://example.com", "http://example.com"],
    ["javascript:alert(1)", null],
    ["JavaScript:alert(1)", null],
    ["data:text/html,<script>alert(1)</script>", null],
    ["not a url", null],
    [null, null],
  ])("renders %s as %s", (input, expected) => {
    expect(safeHttpUrl(input)).toBe(expected)
  })

  test("a non-http link is refused when the template is saved", () => {
    const testLink = saveTemplateRequest.shape.testLink
    expect(testLink.safeParse("javascript:alert(1)").success).toBe(false)
    expect(testLink.safeParse("https://example.com").success).toBe(true)
    expect(testLink.safeParse("").data).toBeNull()
  })
})
