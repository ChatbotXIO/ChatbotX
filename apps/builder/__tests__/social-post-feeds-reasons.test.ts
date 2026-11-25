// @vitest-environment node

import { postIssueCodes } from "@chatbotx.io/utils/post-publishing"
import { describe, expect, test } from "vitest"
import { FEED_REASON_MESSAGES } from "@/features/social-post-feeds/lib/feed-labels"
import { reasonKeysOf } from "@/features/social-post-feeds/lib/feed-reasons"

describe("ledger reasons shown in the Items list", () => {
  test("a content refusal shows the generic refusal and the specific issues", () => {
    expect(
      reasonKeysOf("socialPostContentInvalid,textTooLong,tooManyLinks"),
    ).toEqual(["invalid", "textTooLong", "issueTooManyLinks"])
  })

  test("the codes the runner writes map to their own message", () => {
    expect(reasonKeysOf("noDestinationAccepts")).toEqual([
      "noDestinationAccepts",
    ])
    expect(reasonKeysOf("templateError")).toEqual(["templateError"])
    expect(reasonKeysOf("imageFailed,droppedTargets")).toEqual([
      "imageFailed",
      "droppedTargets",
    ])
  })

  test("old rows and unknown codes keep a sensible message", () => {
    expect(reasonKeysOf("validation")).toEqual(["invalid"])
    expect(reasonKeysOf("somethingNew")).toEqual(["other"])
  })

  test("every publishing issue code has a specific message, and every message key exists", () => {
    for (const code of postIssueCodes.options) {
      const [key] = reasonKeysOf(code)
      expect(key, code).not.toBe("other")
      expect(
        FEED_REASON_MESSAGES[key as keyof typeof FEED_REASON_MESSAGES],
      ).toBeTruthy()
    }
  })

  test("repeats of one message are shown once", () => {
    expect(reasonKeysOf("mediaTooLarge,mediaTooMany")).toEqual(["issueMedia"])
  })
})
