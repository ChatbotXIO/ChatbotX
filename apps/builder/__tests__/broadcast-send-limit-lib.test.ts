import { broadcastSendLimitIssues } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  describeBroadcastSendLimit,
  resolveSendLimitIssueKey,
  resolveWindowedReceiversCount,
} from "@/features/broadcasts/lib/broadcast-send-limit"

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

  test("describes a full range limit", () => {
    const result = describeBroadcastSendLimit(
      {
        audienceRangeStart: 1,
        audienceRangeEnd: 20_000,
        sendRatePerMinute: null,
      },
      t,
    )
    expect(result).toContain("broadcasts.sendLimit.rangeSummary")
    expect(result).not.toContain("broadcasts.sendLimit.rangeFromSummary")
    expect(result).not.toContain("broadcasts.sendLimit.rateSummary")
  })

  test("describes a start-only limit with the dedicated rangeFromSummary key", () => {
    const result = describeBroadcastSendLimit(
      {
        audienceRangeStart: 5,
        audienceRangeEnd: null,
        sendRatePerMinute: null,
      },
      t,
    )
    expect(result).toContain("broadcasts.sendLimit.rangeFromSummary")
    expect(result).not.toContain("broadcasts.sendLimit.rangeSummary")
  })

  test("describes an end-only limit as a range starting at 1", () => {
    const result = describeBroadcastSendLimit(
      {
        audienceRangeStart: null,
        audienceRangeEnd: 20_000,
        sendRatePerMinute: null,
      },
      t,
    )
    expect(result).toContain('"start":1')
    expect(result).toContain("broadcasts.sendLimit.rangeSummary")
    expect(result).not.toContain("broadcasts.sendLimit.rangeFromSummary")
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

describe("resolveSendLimitIssueKey", () => {
  test("maps the known rangeEndBeforeStart issue code to its i18n key", () => {
    expect(
      resolveSendLimitIssueKey(broadcastSendLimitIssues.rangeEndBeforeStart),
    ).toBe("broadcasts.sendLimit.rangeEndBeforeStart")
  })

  test("returns undefined for an unknown message", () => {
    expect(resolveSendLimitIssueKey("some other error")).toBeUndefined()
  })

  test("returns undefined when there is no message at all", () => {
    expect(resolveSendLimitIssueKey(undefined)).toBeUndefined()
  })
})

describe("resolveWindowedReceiversCount", () => {
  test("returns the total unclamped when neither bound is set", () => {
    expect(
      resolveWindowedReceiversCount(120, {
        audienceRangeStart: null,
        audienceRangeEnd: null,
      }),
    ).toBe(120)
  })

  test("clamps to a window inside the total", () => {
    expect(
      resolveWindowedReceiversCount(120, {
        audienceRangeStart: 10,
        audienceRangeEnd: 20,
      }),
    ).toBe(11)
  })

  test("returns 0 when the start position is past the total", () => {
    expect(
      resolveWindowedReceiversCount(10, {
        audienceRangeStart: 50,
        audienceRangeEnd: null,
      }),
    ).toBe(0)
  })

  test("returns 0 when the end position is before the start position", () => {
    expect(
      resolveWindowedReceiversCount(120, {
        audienceRangeStart: 20,
        audienceRangeEnd: 10,
      }),
    ).toBe(0)
  })
})
