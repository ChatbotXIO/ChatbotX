import { describe, expect, test } from "vitest"
import {
  capiEventDedupsPerUtcDay,
  capiEventRequiresCtwaClid,
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
