import { describe, expect, test } from "vitest"
import { estimatedMinutesToMs, parseBucHeader } from "../src/apis/usage"
import { retryAfterForQuota } from "../src/handlers/bulk-thread-control"

describe("estimated_time_to_regain_access unit", () => {
  test("is converted from minutes to milliseconds", () => {
    expect(estimatedMinutesToMs(0)).toBe(0)
    expect(estimatedMinutesToMs(1)).toBe(60_000)
    expect(estimatedMinutesToMs(30)).toBe(1_800_000)
  })

  test("retryAfterForQuota waits Meta's minutes, not seconds", () => {
    const usage = parseBucHeader(
      JSON.stringify({
        "123": [
          {
            call_count: 40,
            total_cputime: 10,
            total_time: 10,
            estimated_time_to_regain_access: 5,
          },
        ],
      }),
    )

    expect(retryAfterForQuota(usage, false)).toBe(5 * 60_000)
  })

  test("parseBucHeader still returns the raw minutes figure unchanged", () => {
    const usage = parseBucHeader(
      JSON.stringify({
        "1": [{ call_count: 1, estimated_time_to_regain_access: 7 }],
      }),
    )
    expect(usage?.estimatedTimeToRegainAccess).toBe(7)
  })
})
