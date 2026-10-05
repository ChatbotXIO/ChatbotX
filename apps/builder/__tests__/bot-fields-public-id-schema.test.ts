// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  publicBotFieldIdSchema,
  resetBotFieldsRequest,
} from "@/features/bot-fields/schema/action"

describe("publicBotFieldIdSchema", () => {
  test("keeps a Snowflake id beyond 2^53 intact", () => {
    expect(publicBotFieldIdSchema.parse("1234567890123456789")).toBe(
      "1234567890123456789",
    )
  })

  test("still accepts a plain integer for older callers", () => {
    expect(publicBotFieldIdSchema.parse(42)).toBe("42")
  })

  test("rejects non-numeric strings and non-positive numbers", () => {
    expect(publicBotFieldIdSchema.safeParse("plan").success).toBe(false)
    expect(publicBotFieldIdSchema.safeParse(0).success).toBe(false)
  })
})

describe("resetBotFieldsRequest", () => {
  test("requires at least one id and caps the batch", () => {
    expect(resetBotFieldsRequest.safeParse({ ids: [] }).success).toBe(false)
    expect(
      resetBotFieldsRequest.safeParse({
        ids: Array.from({ length: 101 }, (_, i) => String(i + 1)),
      }).success,
    ).toBe(false)
  })
})
