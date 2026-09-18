import { describe, expect, test } from "vitest"
import { resolveBroadcastInboxLabelKey } from "../broadcast-inbox-label"

describe("resolveBroadcastInboxLabelKey", () => {
  test.each([
    ["messenger", "fields.messengerChannels.label"],
    ["whatsapp", "fields.whatsappChannels.label"],
    ["telegram", "fields.inbox.label"],
    ["omnichannel", "fields.inbox.label"],
  ] as const)("%s → %s", (channel, labelKey) => {
    expect(resolveBroadcastInboxLabelKey(channel)).toBe(labelKey)
  })
})
