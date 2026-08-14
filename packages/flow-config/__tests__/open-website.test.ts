import { describe, expect, test } from "vitest"
import { openWebsiteStepDefaultFn, openWebsiteStepSchema } from "../src"

describe("openWebsiteStepSchema", () => {
  test("accepts absolute URLs", () => {
    const value = {
      ...openWebsiteStepDefaultFn(),
      url: "https://example.test/booking/slug",
    }

    expect(openWebsiteStepSchema.safeParse(value).success).toBe(true)
  })

  test("accepts URL templates with variable placeholders", () => {
    const value = {
      ...openWebsiteStepDefaultFn(),
      url: "https://example.test/booking/slug?u={{user_id}}",
    }

    expect(openWebsiteStepSchema.safeParse(value).success).toBe(true)
  })

  test("rejects non-URL strings", () => {
    const value = {
      ...openWebsiteStepDefaultFn(),
      url: "not a url",
    }

    expect(openWebsiteStepSchema.safeParse(value).success).toBe(false)
  })
})
