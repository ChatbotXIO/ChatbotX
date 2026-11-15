import { describe, expect, test } from "vitest"
import {
  normalizeCommentPostTarget,
  withNormalizedPostTarget,
} from "../src/comment-automation/post-target"

describe("normalizeCommentPostTarget", () => {
  test("stores hashtags in canonical form", () => {
    expect(
      normalizeCommentPostTarget({
        type: "hashtags",
        value: ["#VIP", "vip", "Sale"],
      }),
    ).toEqual({ type: "hashtags", value: ["vip", "sale"] })
  })

  test("leaves every other target untouched", () => {
    const post = { type: "postIds" as const, value: ["123_456"] }
    expect(normalizeCommentPostTarget(post)).toBe(post)
  })

  test("rejects an empty hashtag list", () => {
    expect(() =>
      normalizeCommentPostTarget({ type: "hashtags", value: ["#", " "] }),
    ).toThrow("Add at least one hashtag")
  })

  test("rejects more than 20 hashtags", () => {
    expect(() =>
      normalizeCommentPostTarget({
        type: "hashtags",
        value: Array.from({ length: 21 }, (_, index) => `tag${index}`),
      }),
    ).toThrow("Use at most 20 hashtags")
  })

  test("rejects a hashtag a caption could never carry", () => {
    expect(() =>
      normalizeCommentPostTarget({ type: "hashtags", value: ["vip sale"] }),
    ).toThrow("Invalid hashtag")
  })
})

describe("withNormalizedPostTarget", () => {
  test("a write without a post passes through", () => {
    const data = { name: "x" }
    expect(withNormalizedPostTarget(data)).toBe(data)
  })
})
