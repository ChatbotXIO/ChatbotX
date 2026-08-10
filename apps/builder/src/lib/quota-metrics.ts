import { planStatuses } from "@chatbotx.io/database/partials"

// Re-exported so existing importers (`NavUsage`, `UsageRing`, `AccountRail`,
// `layout.tsx`) don't need to change their import path. The implementation
// now lives in `@chatbotx.io/account-ui`, shared with the enterprise portal's
// account rail, so the trial-countdown arithmetic can never drift between
// the two apps again. `trialMessageClassName` stays re-exported from
// `./trial-message`, which already wraps the package.
export {
  buildPlanNotice,
  buildTrialInfo,
  type PlanNotice,
  quotaUsageState,
  type TrialInfo,
  type TrialLevel,
} from "@chatbotx.io/account-ui/lib/plan-notice"

export type QuotaMetricKey =
  | "contacts"
  | "mac"
  | "botMessages"
  | "monthlyBotMessages"
  | "workspaces"
  | "channels"
  | "teamMembers"

export interface QuotaMetric {
  key: QuotaMetricKey
  limit: number
  used: number
  /** Display-only contribution of the currently viewed workspace. */
  workspaceUsed?: number
}

const DISPLAY_KEYS: QuotaMetricKey[] = [
  "mac",
  "contacts",
  "botMessages",
  "monthlyBotMessages",
  "workspaces",
  "channels",
  "teamMembers",
]

type UsageSummary = Partial<
  Record<
    QuotaMetricKey,
    { used: number; limit: number | null; workspaceUsed?: number }
  >
>

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
 * Builds workspace-context metrics while leaving the account-wide workspace
 * seat count untouched. The ring/bar fill remains based on `used / limit`.
 */
export function buildWorkspaceQuotaMetrics(
  summary: UsageSummary | null,
): QuotaMetric[] {
  return buildQuotaMetrics(summary).map((metric) => {
    const workspaceUsed = summary?.[metric.key]?.workspaceUsed
    return workspaceUsed === undefined ? metric : { ...metric, workspaceUsed }
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

/**
 * Shared blocked-state derivation for the cloud trial-expiry UX. Mirrors the
 * server-side access gate but stays pure so server components and client
 * affordances can derive the same boolean from plan fields already in hand.
 *
 * Allow-list, mirroring `userQuotaService.getAccessStateFromQuota`: only
 * `active` and a non-expired `trial` are allowed. Every other status
 * (`past_due`, `expired`, expired `trial`, unrecognized) blocks.
 */
export function isBlockedFromPlan(
  planStatus: string | null,
  trialEndsAt: string | null,
): boolean {
  if (planStatus === null) {
    return false
  }

  if (planStatus !== TRIAL_STATUS) {
    return planStatus !== ACTIVE_STATUS
  }

  if (!trialEndsAt) {
    return false
  }

  const trialEnd = new Date(trialEndsAt).getTime()
  if (Number.isNaN(trialEnd)) {
    return false
  }

  return trialEnd <= Date.now()
}

/**
 * Discriminates WHY the account is blocked, mirroring
 * `userQuotaService.getAccessState`'s `reason` field: `"status"` when the
 * plan itself blocks (see {@link isBlockedFromPlan}), else `"mac"` when the
 * account has hit its monthly-active-contacts limit (the caller passes the
 * already-fetched `atLimit.mac` from `quotaEnforcementService.getAtLimitMap`
 * so this stays pure and avoids a redundant service call), else `null`.
 */
export function resolveBlockReason(
  planStatus: string | null,
  trialEndsAt: string | null,
  macAtLimit: boolean,
): "status" | "mac" | null {
  if (isBlockedFromPlan(planStatus, trialEndsAt)) {
    return "status"
  }
  return macAtLimit ? "mac" : null
}

/** Keys the usage labels translate, narrowed so any `t` covering them fits. */
type UsageLabelKey =
  | "billing.usage.contacts"
  | "billing.usage.mac"
  | "billing.usage.botMessages"
  | "billing.usage.monthlyBotMessages"
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
    botMessages: t("billing.usage.botMessages"),
    monthlyBotMessages: t("billing.usage.monthlyBotMessages"),
    workspaces: t("billing.usage.workspaces"),
    channels: t("billing.usage.channels"),
    teamMembers: t("billing.usage.teamMembers"),
  }
}

/**
 * Trial `planStatus` value, shared with the access gate
 * (`userQuotaService.getAccessStateFromQuota`) and the `layout.tsx` banner wiring
 * via the single `planStatuses` source so the two sides can never drift.
 */
const TRIAL_STATUS = planStatuses.enum.trial
const ACTIVE_STATUS = planStatuses.enum.active
