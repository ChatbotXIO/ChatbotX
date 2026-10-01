import { describe, expect, test } from "vitest"
import {
  ARCHIVE_RELEASE_CHANNELS,
  channelTypes,
  isThreadControlChannel,
  supportsArchiveRelease,
  THREAD_CONTROL_CHANNELS,
} from "../src/channel"

describe("isThreadControlChannel", () => {
  test.each(
    THREAD_CONTROL_CHANNELS,
  )("returns true for routing-capable channel %s", (channel) => {
    expect(isThreadControlChannel(channel)).toBe(true)
  })

  test("returns false for a channel without routing", () => {
    expect(isThreadControlChannel("webchat")).toBe(false)
  })

  test("returns false for null, undefined and unknown strings", () => {
    expect(isThreadControlChannel(null)).toBe(false)
    expect(isThreadControlChannel(undefined)).toBe(false)
    expect(isThreadControlChannel("not-a-channel")).toBe(false)
  })
})

describe("THREAD_CONTROL_CHANNELS", () => {
  test("is a subset of channelTypes", () => {
    for (const channel of THREAD_CONTROL_CHANNELS) {
      expect(channelTypes.options).toContain(channel)
    }
  })
})

describe("supportsArchiveRelease", () => {
  test("whatsapp releases on archive, messenger does not", () => {
    expect(supportsArchiveRelease("whatsapp")).toBe(true)
    expect(supportsArchiveRelease("messenger")).toBe(false)
  })

  test("is false for null, undefined and unknown channels", () => {
    expect(supportsArchiveRelease(null)).toBe(false)
    expect(supportsArchiveRelease(undefined)).toBe(false)
    expect(supportsArchiveRelease("webchat")).toBe(false)
  })

  test("is a subset of the routing channels", () => {
    for (const channel of ARCHIVE_RELEASE_CHANNELS) {
      expect(THREAD_CONTROL_CHANNELS).toContain(channel)
    }
  })
})
