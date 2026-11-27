import { describe, expect, test } from "vitest"
import { channelLabel } from "@/features/inboxes/lib/channel-label"

describe("channelLabel", () => {
  test.each([
    ["threads", "Threads"],
    ["api", "API"],
    ["whatsapp", "WhatsApp"],
    ["instagram", "Instagram"],
    ["unknown_channel", "unknown_channel"],
  ])("%s reads %s", (channel, label) => {
    expect(channelLabel(channel)).toBe(label)
  })
})
