import { describe, expect, test } from "vitest"
import {
  channelTypes,
  dmConversationUsesSourceId,
} from "../src/partials/channel"

describe("dmConversationUsesSourceId", () => {
  test("is true for TikTok, whose DM conversation is keyed by a non-null sourceId", () => {
    expect(dmConversationUsesSourceId("tiktok")).toBe(true)
  })

  test("is false for every channel whose DM conversation has a null sourceId", () => {
    for (const channel of channelTypes.options) {
      if (channel === "tiktok") {
        continue
      }
      expect(dmConversationUsesSourceId(channel)).toBe(false)
    }
  })

  test("is false when the channel is unknown", () => {
    expect(dmConversationUsesSourceId(null)).toBe(false)
    expect(dmConversationUsesSourceId(undefined)).toBe(false)
  })
})
