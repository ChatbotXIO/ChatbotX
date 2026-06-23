import type { useTranslations } from "next-intl"
import type { getTranslations } from "next-intl/server"
import type { TrialInfo, TrialLevel } from "@/lib/quota-metrics"

/**
 * next-intl produces the same translator shape from the client `useTranslations`
 * hook and the awaited server `getTranslations` call, so this alias lets the
 * helper be reused from both the client sidebar (`NavUsage`) and the
 * server-rendered account rail (`AccountRail`).
 */
type Translator =
  | ReturnType<typeof useTranslations>
  | Awaited<ReturnType<typeof getTranslations>>

/**
 * Maps a trial state to its user-facing countdown copy. Shared so the sidebar
 * and the account rail never word the trial notice differently.
 */
export function resolveTrialMessage(trial: TrialInfo, t: Translator): string {
  if (trial.level === "expired") {
    return t("billing.trial.expired")
  }
  if (trial.daysRemaining === 1) {
    return t("billing.trial.endsTomorrow")
  }
  return t("billing.trial.daysLeft", { days: trial.daysRemaining })
}

/**
 * Text classes that escalate the trial notice as the trial runs out, so the
 * sidebar and account rail highlight urgency identically. `info` stays muted;
 * `warning` (≤3 days) turns amber; `expired` turns destructive.
 */
const TRIAL_MESSAGE_CLASS: Record<TrialLevel, string> = {
  info: "text-muted-foreground",
  warning: "font-medium text-amber-600 dark:text-amber-500",
  expired: "font-medium text-destructive",
}

export function trialMessageClassName(level: TrialLevel): string {
  return TRIAL_MESSAGE_CLASS[level]
}
