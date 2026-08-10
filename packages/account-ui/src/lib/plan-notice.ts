import { planStatuses } from "@chatbotx.io/database/partials"

const DAY_MS = 24 * 60 * 60 * 1000
/** At or below this many days remaining the banner escalates to a warning. */
const URGENT_THRESHOLD_DAYS = 3

const TRIAL_STATUS = planStatuses.enum.trial
const PAST_DUE_STATUS = planStatuses.enum.past_due

export type TrialLevel = "info" | "warning" | "expired"

export interface TrialInfo {
  /** Whole days until the trial ends; `<= 0` once the end date has passed. */
  daysRemaining: number
  level: TrialLevel
}

/**
 * Discriminated banner state derived from the plan fields on a quota row. The
 * plan-status banner renders from this:
 *  - `trial`   → escalating trial countdown (carries {@link TrialInfo}).
 *  - `pastDue` → persistent "update payment" warning (no countdown).
 *  - `null`    → nothing to show (active / free-folded-into-active / unknown).
 * Expired-trial flows through the `trial` branch (its level becomes "expired").
 */
export type PlanNotice =
  | { kind: "trial"; info: TrialInfo }
  | { kind: "pastDue" }

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
 * syncs onto the quota row. Returns `null` whenever the user is not on a
 * trial, so callers can render nothing. Pure and `now`-injectable for testing.
 * `periodEnd` accepts a `Date` or an ISO string — the two apps store it
 * differently (a live `Date` column vs. a serialized ISO value).
 */
export function buildTrialInfo(
  planStatus: string | null,
  periodEnd: Date | string | null,
  now: number = Date.now(),
): TrialInfo | null {
  if (planStatus !== TRIAL_STATUS || !periodEnd) {
    return null
  }

  const end = new Date(periodEnd).getTime()
  if (Number.isNaN(end)) {
    return null
  }

  const daysRemaining = Math.ceil((end - now) / DAY_MS)
  return { daysRemaining, level: resolveTrialLevel(daysRemaining) }
}

/**
 * Single entry point callers use to decide what (if anything) to show in the
 * plan-status banner. Keys off the shared `planStatuses` enum so it can never
 * drift from the access gate. Pure and `now`-injectable for testing.
 */
export function buildPlanNotice(
  planStatus: string | null,
  periodEnd: Date | string | null,
  now: number = Date.now(),
): PlanNotice | null {
  const trial = buildTrialInfo(planStatus, periodEnd, now)
  if (trial) {
    return { kind: "trial", info: trial }
  }
  if (planStatus === PAST_DUE_STATUS) {
    return { kind: "pastDue" }
  }
  return null
}

/**
 * Text classes that escalate the trial notice as the trial runs out, so every
 * surface that renders a trial countdown highlights urgency identically.
 * `info` stays muted; `warning` (≤3 days) turns amber; `expired` turns
 * destructive.
 */
const TRIAL_MESSAGE_CLASS: Record<TrialLevel, string> = {
  info: "text-muted-foreground",
  warning: "font-medium text-amber-600 dark:text-amber-500",
  expired: "font-medium text-destructive",
}

export function trialMessageClassName(level: TrialLevel): string {
  return TRIAL_MESSAGE_CLASS[level]
}

/**
 * Derives the presentational state for a single quota metric: the clamped
 * fill percentage and whether usage has reached the limit. Shared so every
 * usage-bar rendering surface can never diverge on this arithmetic.
 */
export function quotaUsageState(
  used: number,
  limit: number,
): { pct: number; isOverLimit: boolean } {
  // A non-positive limit means no allowance is configured (e.g. a feature the
  // plan hard-disables). Any usage is then at/over capacity, so render a full
  // bar rather than the contradictory "0% filled but over limit" state.
  if (limit <= 0) {
    return { pct: 100, isOverLimit: true }
  }
  const pct = Math.min(100, Math.round((used / limit) * 100))
  return { pct, isOverLimit: used >= limit }
}
