import { cn } from "@chatbotx.io/ui/lib/utils"
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
 */
export function UsageRing({
  used,
  limit,
  label,
  workspaceUsed,
  className,
}: UsageRingProps) {
  const { pct: userPct, isOverLimit } = quotaUsageState(used, limit)
  const { pct: workspacePct } = quotaUsageState(workspaceUsed, limit)

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="min-w-0 flex-1">
        <span className="truncate text-muted-foreground text-xs">{label}</span>
        {/* Decorative: usage amounts are intentionally not displayed as text. */}
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
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width] dark:bg-emerald-500"
            style={{ width: `${workspacePct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
