import { Progress } from "@chatbotx.io/ui/components/ui/progress"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useFormatter } from "next-intl"
import { quotaUsageState } from "../lib/plan-notice"

export type UsageMetric = {
  /** Stable React key. */
  key: string
  /** Pre-resolved, already-translated label. */
  label: string
  used: number
  /** `null` means unlimited: render the count with no progress bar. */
  limit: number | null
  /** Display-only contribution of the currently viewed workspace. */
  workspaceUsed?: number
}

/**
 * Presentational quota usage bars, shared by the account rail on both the OSS
 * builder and the enterprise portal. Numbers are formatted via next-intl so
 * server and client renders produce identical text; labels are resolved by
 * the caller so this component never touches a translation catalog.
 */
export function UsageBars({
  metrics,
  className,
}: {
  metrics: UsageMetric[]
  className?: string
}) {
  const formatter = useFormatter()
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {metrics.map((metric) => {
        const isLimited = metric.limit !== null
        const { pct, isOverLimit } = isLimited
          ? quotaUsageState(metric.used, metric.limit as number)
          : { pct: 0, isOverLimit: false }

        return (
          <div className="flex flex-col gap-1" key={metric.key}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">
                {metric.label}
              </span>
              <span
                className={cn(
                  "shrink-0 text-muted-foreground tabular-nums",
                  isOverLimit && "font-medium text-destructive",
                )}
              >
                {metric.workspaceUsed !== undefined && (
                  <>{formatter.number(metric.workspaceUsed)} / </>
                )}
                {formatter.number(metric.used)}
                {isLimited && ` / ${formatter.number(metric.limit as number)}`}
              </span>
            </div>
            {isLimited && (
              <Progress
                className={cn(isOverLimit && "bg-destructive/20")}
                value={pct}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
