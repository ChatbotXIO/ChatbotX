import { Progress } from "@chatbotx.io/ui/components/ui/progress"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useFormatter } from "next-intl"
import {
  type QuotaMetric,
  type QuotaMetricKey,
  quotaUsageState,
} from "@/lib/quota-metrics"

export type { QuotaMetric, QuotaMetricKey } from "@/lib/quota-metrics"

/** Values at or above this are abbreviated (500,000,000 → 500M) to fit the narrow rail. */
const COMPACT_THRESHOLD = 10_000

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
  const formatCount = (value: number) =>
    value >= COMPACT_THRESHOLD
      ? formatter.number(value, {
          notation: "compact",
          maximumFractionDigits: 1,
        })
      : formatter.number(value)
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
                title={`${formatter.number(metric.used)} / ${formatter.number(metric.limit)}`}
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
