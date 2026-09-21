import { describe, expect, test } from "vitest"
import { describeBroadcastSendLimit } from "@/features/broadcasts/lib/broadcast-send-limit"

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}::${JSON.stringify(params)}` : key

describe("describeBroadcastSendLimit", () => {
  test("returns null when nothing is set", () => {
    expect(
      describeBroadcastSendLimit(
        {
          audienceRangeStart: null,
          audienceRangeEnd: null,
          sendRatePerMinute: null,
        },
        t,
      ),
    ).toBeNull()
  })

  test("describes a range-only limit", () => {
    const result = describeBroadcastSendLimit(
      {
        audienceRangeStart: 1,
        audienceRangeEnd: 20_000,
        sendRatePerMinute: null,
      },
      t,
    )
    expect(result).toContain("broadcasts.sendLimit.rangeSummary")
    expect(result).not.toContain("broadcasts.sendLimit.rateSummary")
  })

  test("describes a rate-only limit", () => {
    const result = describeBroadcastSendLimit(
      {
        audienceRangeStart: null,
        audienceRangeEnd: null,
        sendRatePerMinute: 100,
      },
      t,
    )
    expect(result).toContain("broadcasts.sendLimit.rateSummary")
    expect(result).not.toContain("broadcasts.sendLimit.rangeSummary")
  })

  test("describes both a range and a rate together", () => {
    const result = describeBroadcastSendLimit(
      {
        audienceRangeStart: 1,
        audienceRangeEnd: 20_000,
        sendRatePerMinute: 100,
      },
      t,
    )
    expect(result).toContain("broadcasts.sendLimit.rangeSummary")
    expect(result).toContain("broadcasts.sendLimit.rateSummary")
  })
})
