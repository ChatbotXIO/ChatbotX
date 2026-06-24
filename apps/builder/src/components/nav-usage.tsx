"use client"

import { useSidebar } from "@chatbotx.io/ui/components/ui/sidebar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { UpgradePlanButton } from "@/enterprise/features/billing/upgrade-plan-dialog"
import {
  buildPlanNotice,
  buildUsageLabels,
  type QuotaMetric,
  selectPrimaryMetric,
} from "@/lib/quota-metrics"
import { resolveTrialMessage, trialMessageClassName } from "@/lib/trial-message"
import { UsageRing } from "./usage-ring"

export type { QuotaMetric, QuotaMetricKey } from "@/lib/quota-metrics"

export interface QuotaSummary {
  metrics: QuotaMetric[]
  planName: string | null
  planStatus: string | null
  /** ISO date of the self-managed trial end, or null when not on a trial. */
  trialEndsAt: string | null
}

/**
 * Sidebar-footer plan + usage block (ManyChat-style). Renders a circular usage
 * ring for the headline metric and a plan-state CTA:
 *  - trial   → countdown text + prominent Upgrade CTA.
 *  - pastDue → destructive "Update payment" CTA.
 * Renders nothing when collapsed to icons, or when there is no limit to show
 * and no active trial/past-due state (free / active-without-limits).
 */
export function NavUsage({
  metrics,
  planStatus,
  trialEndsAt,
}: {
  metrics: QuotaMetric[]
  planStatus: string | null
  trialEndsAt: string | null
}) {
  const t = useTranslations()
  const { state, isMobile } = useSidebar()

  // The rail is too narrow to render the ring/CTA when collapsed to icons.
  if (state === "collapsed" && !isMobile) {
    return null
  }

  const notice = buildPlanNotice(planStatus, trialEndsAt)
  const primary = selectPrimaryMetric(metrics)

  // Nothing to surface: no constrained metric and no trial/past-due state.
  if (!(primary || notice)) {
    return null
  }

  const usageLabels = buildUsageLabels(t)

  return (
    <div className="flex flex-col gap-3 border-t px-2 pt-3 pb-2">
      {primary && (
        <UsageRing
          label={usageLabels[primary.key]}
          limit={primary.limit}
          used={primary.used}
        />
      )}

      {notice?.kind === "trial" && (
        <>
          <p
            className={cn(
              "text-center text-xs",
              trialMessageClassName(notice.info.level),
            )}
          >
            {resolveTrialMessage(notice.info, t)}
          </p>
          <UpgradePlanButton className="w-full" size="sm">
            {t("actions.upgradePlan")}
          </UpgradePlanButton>
        </>
      )}

      {notice?.kind === "pastDue" && (
        <>
          <p className="text-center text-destructive text-xs">
            {t("billing.pastDue.message")}
          </p>
          <UpgradePlanButton className="w-full" size="sm" variant="destructive">
            {t("actions.updatePayment")}
          </UpgradePlanButton>
        </>
      )}
    </div>
  )
}
