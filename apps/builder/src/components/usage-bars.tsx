import { Progress } from "@chatbotx.io/ui/components/ui/progress"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useFormatter } from "next-intl"
import {
  type QuotaMetric,
  type QuotaMetricKey,
  quotaUsageState,
} from "@/lib/quota-metrics"

export type { QuotaMetric, QuotaMetricKey } from "@/lib/quota-metrics"

/**
 * Presentational quota usage bars. Renders in both the client sidebar
 * (`NavUsage`) and the server-rendered account rail; numbers are formatted
 * via next-intl so server and client produce identical text. Labels are
 * resolved by the caller.
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
  const formatter = useFormatter()
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
                {metric.workspaceUsed !== undefined && (
                  <>{formatter.number(metric.workspaceUsed)} / </>
                )}
                {formatter.number(metric.used)} /{" "}
                {formatter.number(metric.limit)}
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
