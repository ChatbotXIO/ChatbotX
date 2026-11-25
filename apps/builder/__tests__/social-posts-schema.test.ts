import { describe, expect, test } from "vitest"
import {
  createSocialPostRequest,
  updateSocialPostRequest,
} from "@/features/social-posts/schema"

const POST_ID = "1234567890123"

describe("composed post request schemas", () => {
  test("an unknown field on update is rejected, not dropped", () => {
    const result = updateSocialPostRequest.safeParse({
      id: POST_ID,
      status: "published",
      text: "x",
    })

    expect(result.success).toBe(false)
  })

  test("an unknown field on create and on a target is rejected", () => {
    expect(
      createSocialPostRequest.safeParse({
        extra: 1,
        targets: [{ destinationId: POST_ID }],
      }).success,
    ).toBe(false)
    expect(
      createSocialPostRequest.safeParse({
        targets: [{ destinationId: POST_ID, extra: 1 }],
      }).success,
    ).toBe(false)
  })

  test("a known update field passes", () => {
    expect(
      updateSocialPostRequest.safeParse({ id: POST_ID, text: "x" }).success,
    ).toBe(true)
  })

  describe("parts and first comment", () => {
    const withTarget = (target: Record<string, unknown>) =>
      createSocialPostRequest.safeParse({
        targets: [{ destinationId: POST_ID, ...target }],
      })

    test("a target takes parts and a first comment, text only", () => {
      expect(
        withTarget({
          firstComment: { text: "c" },
          parts: [{ text: "a" }, { text: "b" }],
        }).success,
      ).toBe(true)
      expect(withTarget({ firstComment: null }).success).toBe(true)
    })

    test("at most ten parts; a part carries only text", () => {
      expect(
        withTarget({
          parts: Array.from({ length: 10 }, () => ({ text: "x" })),
        }).success,
      ).toBe(true)
      expect(
        withTarget({
          parts: Array.from({ length: 11 }, () => ({ text: "x" })),
        }).success,
      ).toBe(false)
      expect(withTarget({ parts: [{ media: [], text: "x" }] }).success).toBe(
        false,
      )
      expect(
        withTarget({ firstComment: { extra: 1, text: "x" } }).success,
      ).toBe(false)
    })
  })
})
