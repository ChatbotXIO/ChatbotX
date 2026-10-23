import { broadcastSendLimitIssues } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  describeBroadcastAudienceRange,
  resolveReceiversCountLabelKey,
  resolveSendLimitIssueKey,
  resolveWindowedReceiversCount,
} from "@/features/broadcasts/lib/broadcast-send-limit"

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}::${JSON.stringify(params)}` : key

describe("describeBroadcastAudienceRange", () => {
  test("returns the translated all label when neither bound is set", () => {
    expect(
      describeBroadcastAudienceRange(
        {
          audienceRangeStart: null,
          audienceRangeEnd: null,
          sendRatePerMinute: null,
        },
        t,
      ),
    ).toBe("broadcasts.sendLimit.allPlaceholder")
  })

  test("describes a full range", () => {
    const result = describeBroadcastAudienceRange(
      {
        audienceRangeStart: 1,
        audienceRangeEnd: 20_000,
        sendRatePerMinute: null,
      },
      t,
    )
    expect(result).toBe(
      'broadcasts.sendLimit.rangeSummary::{"start":1,"end":20000}',
    )
  })

  test("describes a start-only range", () => {
    const result = describeBroadcastAudienceRange(
      {
        audienceRangeStart: 5,
        audienceRangeEnd: null,
        sendRatePerMinute: null,
      },
      t,
    )
    expect(result).toBe('broadcasts.sendLimit.rangeFromSummary::{"start":5}')
  })

  test("describes an end-only range as starting at 1", () => {
    const result = describeBroadcastAudienceRange(
      {
        audienceRangeStart: null,
        audienceRangeEnd: 20_000,
        sendRatePerMinute: null,
      },
      t,
    )
    expect(result).toBe(
      'broadcasts.sendLimit.rangeSummary::{"start":1,"end":20000}',
    )
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
  const noRange = { audienceRangeStart: null, audienceRangeEnd: null }
  const exact = (total: number) => ({ total, capped: false })

  test("returns the total unclamped when neither bound is set", () => {
    expect(resolveWindowedReceiversCount(exact(120), noRange)).toEqual({
      count: 120,
      capped: false,
    })
  })

  test("clamps to a window inside the total", () => {
    expect(
      resolveWindowedReceiversCount(exact(120), {
        audienceRangeStart: 10,
        audienceRangeEnd: 20,
      }),
    ).toEqual({ count: 11, capped: false })
  })

  test("returns 0 when the start position is past the total", () => {
    expect(
      resolveWindowedReceiversCount(exact(10), {
        audienceRangeStart: 50,
        audienceRangeEnd: null,
      }),
    ).toEqual({ count: 0, capped: false })
  })

  test("returns 0 when the end position is before the start position", () => {
    expect(
      resolveWindowedReceiversCount(exact(120), {
        audienceRangeStart: 20,
        audienceRangeEnd: 10,
      }),
    ).toEqual({ count: 0, capped: false })
  })

  test("keeps a capped total a lower bound when there is no window", () => {
    expect(
      resolveWindowedReceiversCount({ total: 100_000, capped: true }, noRange),
    ).toEqual({ count: 100_000, capped: true })
  })

  test("is exact when a capped total's window ends inside the counted rows", () => {
    expect(
      resolveWindowedReceiversCount(
        { total: 100_000, capped: true },
        { audienceRangeStart: 1, audienceRangeEnd: 500 },
      ),
    ).toEqual({ count: 500, capped: false })
  })

  test("stays capped when the window extends past the counted rows", () => {
    expect(
      resolveWindowedReceiversCount(
        { total: 100_000, capped: true },
        { audienceRangeStart: 99_001, audienceRangeEnd: 150_000 },
      ),
    ).toEqual({ count: 1000, capped: true })
  })

  test("never reports 0 for a capped window that starts past the counted rows", () => {
    const result = resolveWindowedReceiversCount(
      { total: 100_000, capped: true },
      { audienceRangeStart: 200_000, audienceRangeEnd: null },
    )
    expect(result.capped).toBe(true)
    expect(resolveReceiversCountLabelKey(result)).toBe(
      "broadcasts.receiversCountUnknown",
    )
  })
})

describe("resolveReceiversCountLabelKey", () => {
  test("picks the label for exact, capped and unknown counts", () => {
    expect(resolveReceiversCountLabelKey({ count: 5, capped: false })).toBe(
      "broadcasts.receiversCount",
    )
    expect(resolveReceiversCountLabelKey({ count: 5, capped: true })).toBe(
      "broadcasts.receiversCountCapped",
    )
    expect(resolveReceiversCountLabelKey({ count: 0, capped: true })).toBe(
      "broadcasts.receiversCountUnknown",
    )
  })
})
