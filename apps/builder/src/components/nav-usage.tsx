"use client"

import { Progress } from "@chatbotx.io/ui/components/ui/progress"
import { useSidebar } from "@chatbotx.io/ui/components/ui/sidebar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"

export type QuotaMetricKey =
  | "contacts"
  | "workspaces"
  | "channels"
  | "teamMembers"

export interface QuotaMetric {
  key: QuotaMetricKey
  limit: number
  used: number
}

export interface QuotaSummary {
  metrics: QuotaMetric[]
  planName: string | null
  planStatus: string | null
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

  return (
    <div className="flex flex-col gap-3 px-2 pb-2">
      {metrics.map((metric) => {
        const pct =
          metric.limit > 0
            ? Math.min(100, Math.round((metric.used / metric.limit) * 100))
            : 0
        const isOverLimit = metric.used >= metric.limit
        return (
          <div className="flex flex-col gap-1" key={metric.key}>
            <div className="flex items-center justify-between text-xs">
              <span className="truncate text-muted-foreground">
                {labels[metric.key]}
              </span>
              <span
                className={cn(
                  "text-muted-foreground tabular-nums",
                  isOverLimit && "font-medium text-destructive",
                )}
              >
                {metric.used.toLocaleString()} / {metric.limit.toLocaleString()}
              </span>
            </div>
            <Progress
              className={cn(isOverLimit && "bg-destructive/20")}
              value={pct}
            />
          </div>
        )
      })}
    </div>
  )
}
