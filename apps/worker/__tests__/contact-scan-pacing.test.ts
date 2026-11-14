import { CONTACT_SCAN_RELEASED_GRACE_MS } from "@chatbotx.io/business/contact-scan"
import { describe, expect, it } from "vitest"
import {
  CONTACT_SCAN_PACING,
  resolveScanPacing,
} from "../src/integration/handlers/contact-scan/pacing"

const MINUTE = 60_000

describe("resolveScanPacing", () => {
  it("does not wait without a signal", () => {
    expect(resolveScanPacing({})).toBe(0)
    expect(resolveScanPacing({ signal: null })).toBe(0)
    expect(resolveScanPacing({ signal: { usagePercent: 40 } })).toBe(0)
  })

  it("waits 2 minutes from 85% usage and 10 minutes from 95%", () => {
    expect(resolveScanPacing({ signal: { usagePercent: 84.9 } })).toBe(0)
    expect(resolveScanPacing({ signal: { usagePercent: 85 } })).toBe(2 * MINUTE)
    expect(resolveScanPacing({ signal: { usagePercent: 94 } })).toBe(2 * MINUTE)
    expect(resolveScanPacing({ signal: { usagePercent: 95 } })).toBe(
      10 * MINUTE,
    )
  })

  it("a rate limit waits 10 minutes even with no usage figure", () => {
    expect(resolveScanPacing({ rateLimited: true })).toBe(10 * MINUTE)
    expect(
      resolveScanPacing({ rateLimited: true, signal: { usagePercent: 10 } }),
    ).toBe(10 * MINUTE)
  })

  it("the provider's own wait wins over usage and a rate limit", () => {
    expect(
      resolveScanPacing({
        rateLimited: true,
        signal: { usagePercent: 99, retryAfterMs: 3 * MINUTE },
      }),
    ).toBe(3 * MINUTE)
  })

  it("the provider's wait is capped at 30 minutes", () => {
    expect(resolveScanPacing({ signal: { retryAfterMs: 120 * MINUTE } })).toBe(
      30 * MINUTE,
    )
  })

  it("a zero provider wait falls through to the usage rule", () => {
    expect(
      resolveScanPacing({ signal: { usagePercent: 90, retryAfterMs: 0 } }),
    ).toBe(2 * MINUTE)
  })
})

describe("CONTACT_SCAN_PACING", () => {
  it("pins the scan rhythm", () => {
    expect(CONTACT_SCAN_PACING).toMatchObject({
      chunkMaxPages: 5,
      chunkBudgetMs: 4 * MINUTE,
      pageGapMs: 1000,
      chunkGapMs: 5000,
    })
  })

  it("a lost delayed job is recovered only after the longest possible wait", () => {
    expect(CONTACT_SCAN_RELEASED_GRACE_MS).toBeGreaterThan(
      CONTACT_SCAN_PACING.maxProviderWaitMs,
    )
  })
})
