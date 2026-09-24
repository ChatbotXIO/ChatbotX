import { describe, expect, test } from "vitest"
import {
  capiDatasetResourceType,
  capiEventDedupsPerUtcDay,
  capiEventRequiresCtwaClid,
  isCapiDisconnected,
} from "../src/meta-conversions/channel-policy"

describe("CAPI channel identity policy", () => {
  test.each([
    ["whatsapp", "business_messaging", true],
    ["whatsapp", "email", false],
    ["messenger", "business_messaging", false],
    ["instagram", "business_messaging", false],
  ] as const)("%s + %s requires ctwa_clid: %s", (channel, actionSource, expected) => {
    expect(capiEventRequiresCtwaClid(channel, actionSource)).toBe(expected)
    expect(capiEventDedupsPerUtcDay(channel, actionSource)).toBe(expected)
  })
})

describe("capiDatasetResourceType", () => {
  test.each([
    ["messenger", "page"],
    ["instagram", "igUser"],
    ["whatsapp", "waba"],
  ] as const)("%s datasets hang off a %s", (channel, expected) => {
    expect(capiDatasetResourceType(channel)).toBe(expected)
  })
})

describe("isCapiDisconnected", () => {
  test("is true only while a user-intent disconnect timestamp is set", () => {
    expect(isCapiDisconnected({ capiDisconnectedAt: new Date() })).toBe(true)
    expect(isCapiDisconnected({ capiDisconnectedAt: null })).toBe(false)
  })

  test("treats an integration without the column as connected", () => {
    expect(isCapiDisconnected({})).toBe(false)
  })
})
