import { describe, expect, test } from "vitest"
import {
  formatApproximateCount,
  resolveAudienceStatus,
} from "@/features/facebook-marketing-messages/lib/audience-status"
import { parseMarketingMessagesTab } from "@/features/facebook-marketing-messages/lib/tab"

const live = (overrides: Record<string, unknown> = {}) => ({
  ready: false,
  missingOnMeta: false,
  deliveryStatus: { code: 200, description: "Normal" },
  ...overrides,
})

describe("resolveAudienceStatus", () => {
  test("persisted readyAt wins even with no live data", () => {
    expect(
      resolveAudienceStatus({ readyAt: new Date(), live: undefined }),
    ).toEqual({ kind: "ready" })
  })
  test("live ready", () => {
    expect(
      resolveAudienceStatus({ readyAt: null, live: live({ ready: true }) }),
    ).toEqual({ kind: "ready" })
  })
  test("missing on Meta", () => {
    expect(
      resolveAudienceStatus({
        readyAt: null,
        live: live({ missingOnMeta: true }),
      }),
    ).toEqual({ kind: "missing" })
  })
  test("non-200 delivery status shows Meta's description", () => {
    expect(
      resolveAudienceStatus({
        readyAt: null,
        live: live({
          deliveryStatus: { code: 300, description: "Audience too small" },
        }),
      }),
    ).toEqual({ kind: "delivery", description: "Audience too small" })
  })
  test("live data present with a 200 delivery is empty", () => {
    expect(resolveAudienceStatus({ readyAt: null, live: live() })).toEqual({
      kind: "none",
    })
  })
  test("no live data (expired grant, failed or disabled query) is unknown, not empty", () => {
    expect(resolveAudienceStatus({ readyAt: null, live: undefined })).toEqual({
      kind: "unknown",
    })
  })
})

describe("formatApproximateCount", () => {
  test("formats a range", () => {
    expect(formatApproximateCount(1000, 1200, "en-US")).toBe("1,000 – 1,200")
  })
  test("dash when a bound is missing or negative", () => {
    expect(formatApproximateCount(null, 1200, "en-US")).toBe("–")
    expect(formatApproximateCount(-1, -1, "en-US")).toBe("–")
    expect(formatApproximateCount(undefined, undefined, "en-US")).toBe("–")
  })
})

describe("parseMarketingMessagesTab", () => {
  test("defaults to campaigns", () => {
    expect(parseMarketingMessagesTab(undefined)).toBe("campaigns")
    expect(parseMarketingMessagesTab("bogus")).toBe("campaigns")
  })
  test("accepts audiences, including from an array param", () => {
    expect(parseMarketingMessagesTab("audiences")).toBe("audiences")
    expect(parseMarketingMessagesTab(["audiences", "x"])).toBe("audiences")
  })
})
