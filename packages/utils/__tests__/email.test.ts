import { describe, expect, test } from "vitest"
import { deterministicMessageId, isEmailThreadSourceId } from "../src/email"

describe("email thread utilities", () => {
  test("recognizes only email thread source ids", () => {
    expect(isEmailThreadSourceId("email:<root@example.com>")).toBe(true)
    expect(isEmailThreadSourceId("post-123")).toBe(false)
    expect(isEmailThreadSourceId(null)).toBe(false)
  })

  test("derives a stable RFC 5322 id from one seed and domain", () => {
    expect(deterministicMessageId("broadcast:contact", "example.com")).toBe(
      deterministicMessageId("broadcast:contact", "example.com"),
    )
  })
})
