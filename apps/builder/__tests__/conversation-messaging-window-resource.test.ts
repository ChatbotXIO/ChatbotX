import { describe, expect, it } from "vitest"
import {
  conversationCompactContactInboxResource,
  conversationContactInboxResource,
  messagingWindowResource,
} from "../src/features/conversations/schema/resource"

describe("messagingWindow on conversation contact inboxes", () => {
  it("is declared on both the full and the compact view", () => {
    expect(conversationContactInboxResource.shape.messagingWindow).toBeDefined()
    expect(
      conversationCompactContactInboxResource.shape.messagingWindow,
    ).toBeDefined()
  })

  it("accepts every state with nullable dates", () => {
    for (const state of [
      "open",
      "humanAgent",
      "closed",
      "unlimited",
      "notApplicable",
      "unknown",
    ]) {
      expect(
        messagingWindowResource.safeParse({
          state,
          changesAt: null,
          closesAt: new Date(),
        }).success,
      ).toBe(true)
    }
    expect(
      messagingWindowResource.safeParse({
        state: "bogus",
        changesAt: null,
        closesAt: null,
      }).success,
    ).toBe(false)
  })
})
