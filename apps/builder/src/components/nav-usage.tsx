"use client"

import { useSidebar } from "@chatbotx.io/ui/components/ui/sidebar"
import { useTranslations } from "next-intl"
import { type QuotaMetric, type QuotaMetricKey, UsageBars } from "./usage-bars"

export type { QuotaMetric, QuotaMetricKey } from "./usage-bars"

export interface QuotaSummary {
  metrics: QuotaMetric[]
  planName: string | null
  planStatus: string | null
  /** ISO date of the self-managed trial end, or null when not on a trial. */
  trialEndsAt: string | null
}

const DAY_MS = 86_400_000

export function NavUsage({
  metrics,
  trialEndsAt,
}: {
  metrics: QuotaMetric[]
  trialEndsAt: string | null
}) {
  const t = useTranslations()
  const { state, isMobile } = useSidebar()

  // The rail is too narrow to render bars/banners when collapsed to icons.
  if (state === "collapsed" && !isMobile) {
    return null
  }

  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((Date.parse(trialEndsAt) - Date.now()) / DAY_MS))
    : null
  const showTrial = daysLeft !== null && daysLeft > 0

  // Nothing to show on the free tier (no limits) and not on a trial.
  if (metrics.length === 0 && !showTrial) {
    return null
  }

  const labels: Record<QuotaMetricKey, string> = {
    contacts: t("billing.usage.contacts"),
    workspaces: t("billing.usage.workspaces"),
    channels: t("billing.usage.channels"),
    teamMembers: t("billing.usage.teamMembers"),
  }

  return (
    <div className="flex flex-col gap-3 px-2 pb-2">
      {showTrial && (
        <div className="rounded-md bg-muted px-2 py-1.5 text-center text-muted-foreground text-xs">
          {t("billing.trial.daysLeft", { days: daysLeft })}
        </div>
      )}
      {metrics.length > 0 && <UsageBars labels={labels} metrics={metrics} />}
    </div>
  )
}
