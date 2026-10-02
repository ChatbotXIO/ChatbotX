import { describe, expect, test } from "vitest"
import {
  profileSnapshotChannels,
  supportsProfileSnapshot,
} from "../src/partials/contact"

describe("supportsProfileSnapshot", () => {
  test("accepts every channel in the capability list", () => {
    for (const channel of profileSnapshotChannels) {
      expect(supportsProfileSnapshot(channel)).toBe(true)
    }
  })

  test.each([
    "messenger",
    "whatsapp",
    "telegram",
    "webchat",
    "",
  ])("rejects %s", (channel) => {
    expect(supportsProfileSnapshot(channel)).toBe(false)
  })
})
