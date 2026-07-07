import { genderTypes } from "@chatbotx.io/database/partials"
import { normalizeGender } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"

describe("profile field normalization", () => {
  test("gender allowlist matches database enum values", () => {
    for (const gender of genderTypes.options) {
      expect(normalizeGender(gender)).toBe(gender)
    }
  })
})
