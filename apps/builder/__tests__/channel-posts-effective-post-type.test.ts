import { describe, expect, test } from "vitest"
import {
  effectivePostType,
  postListWaitsForInboxes,
} from "@/features/channel-posts/lib/posts-search-params"

describe("effectivePostType", () => {
  test.each([
    "liveNow",
    "pastLive",
  ] as const)("falls back to all for %s while no channel reports live", (type) => {
    expect(effectivePostType(type, false)).toBeNull()
  })

  test("keeps a live filter when a channel reports live", () => {
    expect(effectivePostType("liveNow", true)).toBe("liveNow")
  })

  test("keeps a non-live filter and an absent one", () => {
    expect(effectivePostType("photo", false)).toBe("photo")
    expect(effectivePostType(null, false)).toBeNull()
  })
})

describe("postListWaitsForInboxes", () => {
  test("a live filter waits only while the inboxes load", () => {
    expect(postListWaitsForInboxes("pending", "liveNow")).toBe(true)
    expect(postListWaitsForInboxes("success", "liveNow")).toBe(false)
    expect(postListWaitsForInboxes("error", "pastLive")).toBe(false)
  })

  test("a non-live or absent filter never waits", () => {
    expect(postListWaitsForInboxes("pending", "photo")).toBe(false)
    expect(postListWaitsForInboxes("pending", null)).toBe(false)
  })
})
