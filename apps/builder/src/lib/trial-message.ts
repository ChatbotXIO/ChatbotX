import type { useTranslations } from "next-intl"
import type { getTranslations } from "next-intl/server"
import type { TrialInfo } from "@/lib/quota-metrics"

// Re-exported so existing importers (`NavUsage`, `AccountRail`) don't need to
// change their import path. The escalating-urgency classes now live in
// `@chatbotx.io/account-ui`, shared with the enterprise portal's trial notice.
export { trialMessageClassName } from "@chatbotx.io/account-ui/lib/plan-notice"

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
