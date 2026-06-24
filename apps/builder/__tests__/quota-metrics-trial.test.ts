// @vitest-environment node
import { planStatuses } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  buildPlanNotice,
  buildQuotaMetrics,
  buildTrialInfo,
  type QuotaMetric,
  quotaUsageState,
  selectPrimaryMetric,
} from "@/lib/quota-metrics"

// Single source of truth shared with the access gate
// (`userQuotaService.getAccessStateFromQuota`) — drives the value the banner
// keys off, so a literal here would mask the very drift bug this guards against.
const TRIAL_STATUS = planStatuses.enum.trial
const PAST_DUE_STATUS = planStatuses.enum.past_due
const ACTIVE_STATUS = planStatuses.enum.active
const EXPIRED_STATUS = planStatuses.enum.expired

describe("buildQuotaMetrics", () => {
  test("returns an empty list when the summary is null", () => {
    expect(buildQuotaMetrics(null)).toEqual([])
  })

  test("includes the monthly-active-contacts (mac) metric when it has a limit", () => {
    const metrics = buildQuotaMetrics({
      contacts: { used: 10, limit: 100 },
      mac: { used: 5, limit: 50 },
    })
    expect(metrics).toEqual([
      { key: "mac", used: 5, limit: 50 },
      { key: "contacts", used: 10, limit: 100 },
    ])
  })

  test("hides any metric whose limit is unlimited (null)", () => {
    const metrics = buildQuotaMetrics({
      contacts: { used: 10, limit: null },
      mac: { used: 5, limit: null },
      workspaces: { used: 1, limit: 3 },
    })
    expect(metrics).toEqual([{ key: "workspaces", used: 1, limit: 3 }])
  })

  test("orders mac before contacts before the remaining metrics", () => {
    const metrics = buildQuotaMetrics({
      teamMembers: { used: 2, limit: 5 },
      contacts: { used: 10, limit: 100 },
      mac: { used: 5, limit: 50 },
    })
    expect(metrics.map((m) => m.key)).toEqual([
      "mac",
      "contacts",
      "teamMembers",
    ])
  })
})

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
    // A 0 (or negative) limit means the plan grants no allowance, so any state
    // is at/over capacity. The bar must read full + over-limit, never the
    // contradictory "0% filled but over limit".
    expect(quotaUsageState(0, 0)).toEqual({ pct: 100, isOverLimit: true })
    expect(quotaUsageState(5, 0)).toEqual({ pct: 100, isOverLimit: true })
  })
})

describe("selectPrimaryMetric", () => {
  const metric = (key: QuotaMetric["key"]): QuotaMetric => ({
    key,
    used: 1,
    limit: 10,
  })

  test("returns null when there are no metrics", () => {
    expect(selectPrimaryMetric([])).toBeNull()
  })

  test("prefers mac over contacts even when contacts is first", () => {
    expect(selectPrimaryMetric([metric("contacts"), metric("mac")])?.key).toBe(
      "mac",
    )
  })

  test("falls back to contacts when mac has no limit", () => {
    expect(
      selectPrimaryMetric([metric("workspaces"), metric("contacts")])?.key,
    ).toBe("contacts")
  })

  test("hides the ring when neither mac nor contacts is constrained", () => {
    expect(
      selectPrimaryMetric([metric("workspaces"), metric("channels")]),
    ).toBeNull()
  })
})

describe("buildTrialInfo", () => {
  const now = new Date("2026-06-19T12:00:00.000Z").getTime()
  const inDays = (days: number) =>
    new Date(now + days * 24 * 60 * 60 * 1000).toISOString()

  test("returns null when not on a trial", () => {
    expect(buildTrialInfo("active", inDays(5), now)).toBeNull()
    expect(buildTrialInfo(null, inDays(5), now)).toBeNull()
  })

  test("returns null when trialing but no end date", () => {
    expect(buildTrialInfo(TRIAL_STATUS, null, now)).toBeNull()
  })

  test("returns null for an unparseable end date", () => {
    expect(buildTrialInfo(TRIAL_STATUS, "not-a-date", now)).toBeNull()
  })

  test("uses info level when more than 3 days remain", () => {
    expect(buildTrialInfo(TRIAL_STATUS, inDays(5), now)).toEqual({
      daysRemaining: 5,
      level: "info",
    })
  })

  test("escalates to warning at or below 3 days", () => {
    expect(buildTrialInfo(TRIAL_STATUS, inDays(3), now)?.level).toBe("warning")
    expect(buildTrialInfo(TRIAL_STATUS, inDays(1), now)?.level).toBe("warning")
  })

  test("rounds partial days up", () => {
    // 2.5 days out -> ceil -> 3 days, still warning
    expect(buildTrialInfo(TRIAL_STATUS, inDays(2.5), now)).toEqual({
      daysRemaining: 3,
      level: "warning",
    })
  })

  test("marks an elapsed trial as expired", () => {
    const expired = buildTrialInfo(TRIAL_STATUS, inDays(-1), now)
    expect(expired?.level).toBe("expired")
    expect(expired?.daysRemaining).toBeLessThanOrEqual(0)
  })

  test("treats the exact end moment as expired", () => {
    expect(buildTrialInfo(TRIAL_STATUS, inDays(0), now)).toEqual({
      daysRemaining: 0,
      level: "expired",
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
    // expired is handled by the /trial-expired redirect, not the banner
    expect(buildPlanNotice(EXPIRED_STATUS, null, now)).toBeNull()
    expect(buildPlanNotice(null, null, now)).toBeNull()
    expect(buildPlanNotice("free", null, now)).toBeNull()
  })
})
