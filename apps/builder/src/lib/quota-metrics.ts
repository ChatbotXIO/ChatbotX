import { planStatuses } from "@chatbotx.io/database/partials"

export type QuotaMetricKey =
  | "contacts"
  | "mac"
  | "workspaces"
  | "channels"
  | "teamMembers"

export interface QuotaMetric {
  key: QuotaMetricKey
  limit: number
  used: number
}

const DISPLAY_KEYS: QuotaMetricKey[] = [
  "mac",
  "contacts",
  "workspaces",
  "channels",
  "teamMembers",
]

type UsageSummary = Partial<
  Record<QuotaMetricKey, { used: number; limit: number | null }>
>

/**
 * Derives the presentational state for a single quota metric: the clamped
 * fill percentage and whether usage has reached the limit. Shared by the
 * sidebar usage bars and the circular usage ring so they can never diverge.
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

/**
 * Picks the metric to headline in the sidebar usage ring, by fixed precedence:
 * monthly-active-contacts (`mac`) when the plan limits it, else the total
 * `contacts` count when that is limited, else nothing. Only these two
 * contact-shaped metrics ever headline the ring — when neither has a limit the
 * ring is hidden (the multi-bar account rail still lists the other metrics).
 * Each is present in `metrics` only when it has a numeric limit
 * (`buildQuotaMetrics`), so finding it here means it is constrained.
 */
export function selectPrimaryMetric(
  metrics: QuotaMetric[],
): QuotaMetric | null {
  return (
    metrics.find((metric) => metric.key === "mac") ??
    metrics.find((metric) => metric.key === "contacts") ??
    null
  )
}

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

/**
 * ISO date of the self-managed trial end, or `null` when the user is not on a
 * trial. Shared by the home page and the workspace layout so the two surfaces
 * derive the banner's trial end the same way. Structural quota shape so callers
 * pass the `UserQuota` row without coupling this module to the DB type.
 */
export function resolveTrialEndsAt(
  quota: { planStatus: string | null; periodEnd: Date | null } | null,
): string | null {
  return quota?.planStatus === TRIAL_STATUS && quota.periodEnd
    ? new Date(quota.periodEnd).toISOString()
    : null
}

/** Keys the usage labels translate, narrowed so any `t` covering them fits. */
type UsageLabelKey =
  | "billing.usage.contacts"
  | "billing.usage.mac"
  | "billing.usage.workspaces"
  | "billing.usage.channels"
  | "billing.usage.teamMembers"

/**
 * Translated display labels for every quota metric, keyed by metric. Shared by
 * the sidebar usage ring/bars and the account-rail so a new metric's label is
 * defined once. Accepts either the client (`useTranslations`) or server
 * (`getTranslations`) translator.
 */
export function buildUsageLabels(
  t: (key: UsageLabelKey) => string,
): Record<QuotaMetricKey, string> {
  return {
    contacts: t("billing.usage.contacts"),
    mac: t("billing.usage.mac"),
    workspaces: t("billing.usage.workspaces"),
    channels: t("billing.usage.channels"),
    teamMembers: t("billing.usage.teamMembers"),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000
/**
 * Trial `planStatus` value, shared with the access gate
 * (`userQuotaService.getAccessStateFromQuota`) and the `layout.tsx` banner wiring
 * via the single `planStatuses` source so the two sides can never drift.
 */
const TRIAL_STATUS = planStatuses.enum.trial
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

/** `planStatus` value the billing portal writes when a charge is in dunning. */
const PAST_DUE_STATUS = planStatuses.enum.past_due

/**
 * Discriminated banner state derived from the plan fields on `UserQuota`. The
 * plan-status banner renders from this:
 *  - `trial`   → escalating trial countdown (carries {@link TrialInfo}).
 *  - `pastDue` → persistent "update payment" warning (no countdown).
 *  - `null`    → nothing to show (active / free-folded-into-active / unknown).
 * Expired-trial flows through the `trial` branch (its level becomes "expired").
 */
export type PlanNotice =
  | { kind: "trial"; info: TrialInfo }
  | { kind: "pastDue" }

/**
 * Single entry point the banner uses to decide what (if anything) to show.
 * Keys off the shared `planStatuses` constants so it can never drift from the
 * access gate. Pure and `now`-injectable for testing.
 */
export function buildPlanNotice(
  planStatus: string | null,
  trialEndsAt: string | null,
  now: number = Date.now(),
): PlanNotice | null {
  const trial = buildTrialInfo(planStatus, trialEndsAt, now)
  if (trial) {
    return { kind: "trial", info: trial }
  }
  if (planStatus === PAST_DUE_STATUS) {
    return { kind: "pastDue" }
  }
  return null
}
