import { describe, expect, test } from "vitest"
import { hasRealContactEmail } from "../has-real-contact-email"

describe("hasRealContactEmail", () => {
  test.each([
    ["an address", "jane@example.com"],
    ["an address with a plus tag", "jane+shop@example.co.uk"],
  ])("accepts %s", (_label, email) => {
    expect(hasRealContactEmail(email)).toBe(true)
  })

  test.each([
    ["no email", null],
    ["an undefined email", undefined],
    ["an empty string", ""],
    ["whitespace", "   "],
    ["a numeric webchat guest id", "11700000000000001"],
    [
      "a workspace-scoped webchat guest id",
      "11640681410281472:6f9619ff-8b86-d011-b42d-00c04fc964ff",
    ],
  ])("rejects %s", (_label, email) => {
    expect(hasRealContactEmail(email)).toBe(false)
  })
})
