import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  getChannelMediaPrefix,
  getMirroredChannelMediaPrefix,
} from "../src/lib/helper"

const location = {
  channel: "messenger",
  workspaceId: "11624027755544576",
  integrationId: "11700090861420544",
}

describe("channel media prefixes", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-06T08:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("puts the channel first so one storage prefix covers a whole channel", () => {
    expect(getChannelMediaPrefix(location)).toBe(
      "public/messenger/11624027755544576/11700090861420544/2026/10/06",
    )
  })

  test("keeps mirrored copies under the private root with the same layout", () => {
    expect(getMirroredChannelMediaPrefix(location)).toBe(
      "workspace/messenger/11624027755544576/11700090861420544/2026/10/06",
    )
  })
})
