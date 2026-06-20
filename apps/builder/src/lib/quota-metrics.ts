import type { QuotaMetric, QuotaMetricKey } from "@/components/usage-bars"

const DISPLAY_KEYS: QuotaMetricKey[] = [
  "contacts",
  "workspaces",
  "channels",
  "teamMembers",
]

type UsageSummary = Partial<
  Record<QuotaMetricKey, { used: number; limit: number | null }>
>

/**
 * Builds the renderable quota metrics from a level-aware usage summary
 * (`quotaEnforcementService.getUsageSummary`), keeping only the metrics that
 * have a numeric limit (free-tier metrics have `null` limits and are not shown).
 */
export function buildQuotaMetrics(summary: UsageSummary | null): QuotaMetric[] {
  if (!summary) {
    return []
  }

  return DISPLAY_KEYS.flatMap((key) => {
    const entry = summary[key]
    return entry && typeof entry.limit === "number"
      ? [{ key, used: entry.used, limit: entry.limit }]
      : []
  })
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Value the private billing portal writes to `UserQuota.planStatus` for trials. */
const TRIAL_STATUS = "trialing"
/** At or below this many days remaining the banner escalates to a warning. */
const URGENT_THRESHOLD_DAYS = 3

export type TrialLevel = "info" | "warning" | "expired"

export interface TrialInfo {
  /** Whole days until the trial ends; `<= 0` once the end date has passed. */
  daysRemaining: number
  level: TrialLevel
}

function resolveTrialLevel(daysRemaining: number): TrialLevel {
  if (daysRemaining <= 0) {
    return "expired"
  }
  if (daysRemaining <= URGENT_THRESHOLD_DAYS) {
    return "warning"
  }
  return "info"
}

/**
 * Derives trial display state from the plan fields the billing portal already
 * syncs onto `UserQuota`. Returns `null` whenever the user is not on a trial, so
 * callers can render nothing. Pure and `now`-injectable for testing.
 */
export function buildTrialInfo(
  planStatus: string | null,
  trialEndsAt: string | null,
  now: number = Date.now(),
): TrialInfo | null {
  if (planStatus !== TRIAL_STATUS || !trialEndsAt) {
    return null
  }

  const end = new Date(trialEndsAt).getTime()
  if (Number.isNaN(end)) {
    return null
  }

  const daysRemaining = Math.ceil((end - now) / DAY_MS)
  return { daysRemaining, level: resolveTrialLevel(daysRemaining) }
}
