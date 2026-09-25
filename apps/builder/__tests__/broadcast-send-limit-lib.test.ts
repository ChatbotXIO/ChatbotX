import { broadcastSendLimitIssues } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  describeBroadcastAudienceRange,
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
