import { Progress } from "@chatbotx.io/ui/components/ui/progress"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  type QuotaMetric,
  type QuotaMetricKey,
  quotaUsageState,
} from "@/lib/quota-metrics"

export type { QuotaMetric, QuotaMetricKey } from "@/lib/quota-metrics"

/**
 * Presentational quota usage bars. Pure (no hooks/context) so it can render in
 * both the client sidebar (`NavUsage`) and the server-rendered account rail.
 * Labels are resolved by the caller to keep this component context-free.
 */
export function UsageBars({
  metrics,
  labels,
  className,
}: {
  metrics: QuotaMetric[]
  labels: Record<QuotaMetricKey, string>
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {metrics.map((metric) => {
        const { pct, isOverLimit } = quotaUsageState(metric.used, metric.limit)
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
