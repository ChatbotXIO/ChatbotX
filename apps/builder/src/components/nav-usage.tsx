"use client"

import { useSidebar } from "@chatbotx.io/ui/components/ui/sidebar"
import { useTranslations } from "next-intl"
import { type QuotaMetric, type QuotaMetricKey, UsageBars } from "./usage-bars"

export type { QuotaMetric, QuotaMetricKey } from "./usage-bars"

export interface QuotaSummary {
  metrics: QuotaMetric[]
  planName: string | null
  planStatus: string | null
  /** ISO trial end date when `planStatus === "trialing"`, else `null`. */
  trialEndsAt: string | null
}

export function NavUsage({ metrics }: { metrics: QuotaMetric[] }) {
  const t = useTranslations()
  const { state, isMobile } = useSidebar()

  // Nothing to show on the free tier (no limits), and the rail is too narrow
  // to render bars when collapsed to icons.
  if (metrics.length === 0 || (state === "collapsed" && !isMobile)) {
    return null
  }

  const labels: Record<QuotaMetricKey, string> = {
    contacts: t("billing.usage.contacts"),
    workspaces: t("billing.usage.workspaces"),
    channels: t("billing.usage.channels"),
    teamMembers: t("billing.usage.teamMembers"),
  }

  return <UsageBars className="px-2 pb-2" labels={labels} metrics={metrics} />
}
