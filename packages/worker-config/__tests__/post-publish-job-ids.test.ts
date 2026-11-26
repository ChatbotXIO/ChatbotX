import { describe, expect, test } from "vitest"
import {
  postCheckPartJobId,
  postCheckTargetJobId,
  postFeedJobId,
  postPartJobId,
  postPublishJobId,
  postRemoveJobId,
} from "../src/queues/post-publish"

describe("post publish jobs", () => {
  test("one deterministic id per target, so a repeated enqueue is dropped while it waits", () => {
    expect(postPublishJobId("123")).toBe("social-post-target-123")
    expect(postPublishJobId("123")).not.toContain(":")
  })

  test.each([
    ["postPartJobId", postPartJobId, "social-post-part-123"],
    ["postFeedJobId", postFeedJobId, "social-post-feed-123"],
    ["postRemoveJobId", postRemoveJobId, "social-post-remove-123"],
  ])("%s is deterministic and has no colon (BullMQ rejects it)", (_name, helper, expected) => {
    expect(helper("123")).toBe(expected)
    expect(helper("123")).toBe(helper("123"))
    expect(helper("123")).not.toContain(":")
  })

  test("a check job id is per claim: the same lease repeats, a new lease differs, no colon", () => {
    expect(postCheckTargetJobId("1", 5)).toBe(postCheckTargetJobId("1", 5))
    expect(postCheckTargetJobId("1", 5)).not.toBe(postCheckTargetJobId("1", 6))
    expect(postCheckPartJobId("1", 5)).not.toBe(postCheckTargetJobId("1", 5))
    expect(postCheckTargetJobId("1", 5)).not.toContain(":")
    expect(postCheckPartJobId("1", 5)).not.toContain(":")
  })
})
