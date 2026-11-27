// @vitest-environment node

import { describe, expect, test } from "vitest"
import { postAnalyticsTopPost } from "@/features/post-analytics/schema"

const post = {
  caption: null,
  channel: "messenger",
  channelPostId: "1",
  contentType: null,
  gained: 1,
  inboxId: "2",
  inboxName: "Page",
  publishedAt: null,
  thumbnail: null,
  total: 2,
}

describe("top post permalink", () => {
  test("accepts http(s) addresses and null", () => {
    for (const permalink of [
      "https://example.com/p/1",
      "http://example.com/p",
      null,
    ]) {
      expect(
        postAnalyticsTopPost.safeParse({ ...post, permalink }).success,
      ).toBe(true)
    }
  })

  test("refuses any other scheme", () => {
    for (const permalink of [
      "javascript:alert(1)",
      "data:text/html,x",
      "ftp://example.com/x",
      "//evil.test",
      "not a url",
    ]) {
      expect(
        postAnalyticsTopPost.safeParse({ ...post, permalink }).success,
        permalink,
      ).toBe(false)
    }
  })
})
