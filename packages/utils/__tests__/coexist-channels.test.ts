import { describe, expect, test } from "vitest"
import {
  COEXIST_CHANNELS,
  coexistChannels,
  isCoexistChannel,
} from "../src/channel"

describe("isCoexistChannel", () => {
  test.each(
    COEXIST_CHANNELS,
  )("returns true for coexist channel %s", (channel) => {
    expect(isCoexistChannel(channel)).toBe(true)
  })

  test("returns false for a non-coexist channel", () => {
    expect(isCoexistChannel("webchat")).toBe(false)
    expect(isCoexistChannel("telegram")).toBe(false)
  })

  test("returns false for null and undefined", () => {
    expect(isCoexistChannel(null)).toBe(false)
    expect(isCoexistChannel(undefined)).toBe(false)
  })

  test("returns false for an unknown string", () => {
    expect(isCoexistChannel("not-a-channel")).toBe(false)
  })
})

describe("COEXIST_CHANNELS", () => {
  test("matches coexistChannels.options exactly", () => {
    expect(COEXIST_CHANNELS).toEqual(coexistChannels.options)
    expect(COEXIST_CHANNELS).toEqual(["whatsapp", "messenger", "instagram"])
  })
})
