import { cn } from "@chatbotx.io/ui/lib/utils"
import { useFormatter } from "next-intl"
import { quotaUsageState } from "@/lib/quota-metrics"

interface UsageRingProps {
  className?: string
  label: string
  limit: number
  used: number
  /** Current workspace's contribution to the account-wide usage total. */
  workspaceUsed: number
}

/**
 * Presentational three-tier usage bar for the sidebar footer: workspace usage
 * is green, account-wide usage is amber, and remaining plan capacity is gray.
 * The caller owns label resolution and must supply the workspace contribution.
 * Numbers are formatted via next-intl so server and client produce identical
 * text.
 */
export function UsageRing({
  used,
  limit,
  label,
  workspaceUsed,
  className,
}: UsageRingProps) {
  const formatter = useFormatter()
  const { pct: userPct, isOverLimit } = quotaUsageState(used, limit)
  const { pct: workspacePct } = quotaUsageState(workspaceUsed, limit)

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate text-muted-foreground">
            {label}
          </span>
          <span
            className={cn(
              "shrink-0 text-muted-foreground tabular-nums",
              isOverLimit && "font-medium text-destructive",
            )}
          >
            {formatter.number(workspaceUsed, {
              notation: "compact",
              compactDisplay: "short",
              maximumFractionDigits: 1,
            })}{" "}
            /{" "}
            {formatter.number(limit, {
              notation: "compact",
              compactDisplay: "short",
              maximumFractionDigits: 1,
            })}
          </span>
        </div>
        <div
          aria-hidden
          className="relative mt-1 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              isOverLimit ? "bg-destructive" : "bg-amber-500 dark:bg-amber-500",
            )}
            style={{ width: `${userPct}%` }}
          />
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-emerald-500 transition-[width] dark:bg-emerald-500"
            style={{ width: `${workspacePct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
