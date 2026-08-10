// @vitest-environment node
import { planStatuses } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  buildPlanNotice,
  buildTrialInfo,
  quotaUsageState,
  trialMessageClassName,
} from "../plan-notice"

// Single source of truth shared with the access gate — a literal here would
// mask the very drift bug this package guards against.
const TRIAL_STATUS = planStatuses.enum.trial
const PAST_DUE_STATUS = planStatuses.enum.past_due
const ACTIVE_STATUS = planStatuses.enum.active
const EXPIRED_STATUS = planStatuses.enum.expired

describe("quotaUsageState", () => {
  test("clamps the percentage to 100 once usage exceeds the limit", () => {
    expect(quotaUsageState(150, 100)).toEqual({ pct: 100, isOverLimit: true })
  })

  test("rounds the fill percentage to the nearest whole percent", () => {
    expect(quotaUsageState(1, 3)).toEqual({ pct: 33, isOverLimit: false })
  })

  test("flags usage at the exact limit as over-limit", () => {
    expect(quotaUsageState(100, 100)).toEqual({ pct: 100, isOverLimit: true })
  })

  test("renders a non-positive limit as a full, over-limit bar (no allowance)", () => {
    expect(quotaUsageState(0, 0)).toEqual({ pct: 100, isOverLimit: true })
    expect(quotaUsageState(5, 0)).toEqual({ pct: 100, isOverLimit: true })
  })
})

describe("buildTrialInfo", () => {
  const now = new Date("2026-06-19T12:00:00.000Z").getTime()
  const inDays = (days: number) => new Date(now + days * 24 * 60 * 60 * 1000)

  test("returns null when not on a trial", () => {
    expect(buildTrialInfo("active", inDays(5).toISOString(), now)).toBeNull()
    expect(buildTrialInfo(null, inDays(5).toISOString(), now)).toBeNull()
  })

  test("returns null when trialing but no end date", () => {
    expect(buildTrialInfo(TRIAL_STATUS, null, now)).toBeNull()
  })

  test("returns null for an unparseable end date", () => {
    expect(buildTrialInfo(TRIAL_STATUS, "not-a-date", now)).toBeNull()
  })

  test("uses info level when more than 3 days remain", () => {
    expect(buildTrialInfo(TRIAL_STATUS, inDays(5).toISOString(), now)).toEqual({
      daysRemaining: 5,
      level: "info",
    })
  })

  test("escalates to warning at or below 3 days", () => {
    expect(
      buildTrialInfo(TRIAL_STATUS, inDays(3).toISOString(), now)?.level,
    ).toBe("warning")
    expect(
      buildTrialInfo(TRIAL_STATUS, inDays(1).toISOString(), now)?.level,
    ).toBe("warning")
  })

  test("marks an elapsed trial as expired", () => {
    const expired = buildTrialInfo(TRIAL_STATUS, inDays(-1).toISOString(), now)
    expect(expired?.level).toBe("expired")
    expect(expired?.daysRemaining).toBeLessThanOrEqual(0)
  })

  test("treats the exact end moment as expired", () => {
    expect(buildTrialInfo(TRIAL_STATUS, inDays(0).toISOString(), now)).toEqual({
      daysRemaining: 0,
      level: "expired",
    })
  })

  test("accepts a live Date value, not just an ISO string", () => {
    // The portal stores periodEnd as a Date column; the builder stores it as
    // an already-serialized ISO string. Both must resolve identically.
    expect(buildTrialInfo(TRIAL_STATUS, inDays(5), now)).toEqual({
      daysRemaining: 5,
      level: "info",
    })
  })
})

describe("buildPlanNotice", () => {
  const now = new Date("2026-06-19T12:00:00.000Z").getTime()
  const inDays = (days: number) =>
    new Date(now + days * 24 * 60 * 60 * 1000).toISOString()

  test("returns a trial notice carrying the trial info while on trial", () => {
    expect(buildPlanNotice(TRIAL_STATUS, inDays(5), now)).toEqual({
      kind: "trial",
      info: { daysRemaining: 5, level: "info" },
    })
  })

  test("routes an elapsed trial through the trial branch (level expired)", () => {
    const notice = buildPlanNotice(TRIAL_STATUS, inDays(-1), now)
    expect(notice?.kind).toBe("trial")
    expect(notice?.kind === "trial" && notice.info.level).toBe("expired")
  })

  test("returns a pastDue notice when the charge is in dunning", () => {
    expect(buildPlanNotice(PAST_DUE_STATUS, null, now)).toEqual({
      kind: "pastDue",
    })
  })

  test("returns null for active, expired, null, and unknown statuses", () => {
    expect(buildPlanNotice(ACTIVE_STATUS, null, now)).toBeNull()
    expect(buildPlanNotice(EXPIRED_STATUS, null, now)).toBeNull()
    expect(buildPlanNotice(null, null, now)).toBeNull()
    expect(buildPlanNotice("free", null, now)).toBeNull()
  })
})

describe("trialMessageClassName", () => {
  test("returns a distinct class per level", () => {
    const info = trialMessageClassName("info")
    const warning = trialMessageClassName("warning")
    const expired = trialMessageClassName("expired")

    expect(new Set([info, warning, expired]).size).toBe(3)
    expect(warning).toContain("amber")
    expect(expired).toContain("destructive")
  })
})
