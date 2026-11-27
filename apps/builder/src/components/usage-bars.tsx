import { Progress } from "@chatbotx.io/ui/components/ui/progress"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useFormatter } from "next-intl"
import { formatCompactCount } from "@/lib/format-compact-count"
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
  const formatCount = (value: number) => formatCompactCount(formatter, value)
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {metrics.map((metric) => {
        const { pct, isOverLimit } = quotaUsageState(metric.used, metric.limit)
        return (
          <div className="flex flex-col gap-1" key={metric.key}>
            <div className="flex items-center justify-between text-xs">
              <span
                className="min-w-0 truncate text-muted-foreground"
                title={labels[metric.key]}
              >
                {labels[metric.key]}
              </span>
              <span
                className={cn(
                  "ml-2 shrink-0 whitespace-nowrap text-muted-foreground tabular-nums",
                  isOverLimit && "font-medium text-destructive",
                )}
                title={[metric.workspaceUsed, metric.used, metric.limit]
                  .filter((value) => value !== undefined)
                  .map((value) => formatter.number(value))
                  .join(" / ")}
              >
                {metric.workspaceUsed !== undefined && (
                  <>{formatCount(metric.workspaceUsed)} / </>
                )}
                {formatCount(metric.used)} / {formatCount(metric.limit)}
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
