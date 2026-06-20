// @vitest-environment node
import { describe, expect, test } from "vitest"
import { buildTrialInfo } from "@/lib/quota-metrics"

describe("buildTrialInfo", () => {
  const now = new Date("2026-06-19T12:00:00.000Z").getTime()
  const inDays = (days: number) =>
    new Date(now + days * 24 * 60 * 60 * 1000).toISOString()

  test("returns null when not on a trial", () => {
    expect(buildTrialInfo("active", inDays(5), now)).toBeNull()
    expect(buildTrialInfo(null, inDays(5), now)).toBeNull()
  })

  test("returns null when trialing but no end date", () => {
    expect(buildTrialInfo("trialing", null, now)).toBeNull()
  })

  test("returns null for an unparseable end date", () => {
    expect(buildTrialInfo("trialing", "not-a-date", now)).toBeNull()
  })

  test("uses info level when more than 3 days remain", () => {
    expect(buildTrialInfo("trialing", inDays(5), now)).toEqual({
      daysRemaining: 5,
      level: "info",
    })
  })

  test("escalates to warning at or below 3 days", () => {
    expect(buildTrialInfo("trialing", inDays(3), now)?.level).toBe("warning")
    expect(buildTrialInfo("trialing", inDays(1), now)?.level).toBe("warning")
  })

  test("rounds partial days up", () => {
    // 2.5 days out -> ceil -> 3 days, still warning
    expect(buildTrialInfo("trialing", inDays(2.5), now)).toEqual({
      daysRemaining: 3,
      level: "warning",
    })
  })

  test("marks an elapsed trial as expired", () => {
    const expired = buildTrialInfo("trialing", inDays(-1), now)
    expect(expired?.level).toBe("expired")
    expect(expired?.daysRemaining).toBeLessThanOrEqual(0)
  })

  test("treats the exact end moment as expired", () => {
    expect(buildTrialInfo("trialing", inDays(0), now)).toEqual({
      daysRemaining: 0,
      level: "expired",
    })
  })
})
