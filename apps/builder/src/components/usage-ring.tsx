import { cn } from "@chatbotx.io/ui/lib/utils"
import { quotaUsageState } from "@/lib/quota-metrics"

const SIZE = 44
const STROKE = 4
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Presentational circular usage ring (ManyChat-style) for the sidebar footer.
 * Pure (no hooks/context) like {@link UsageBars} so the caller owns label and
 * value resolution. The ring fills clockwise from the top; the track turns
 * destructive once usage reaches the limit.
 */
export function UsageRing({
  used,
  limit,
  label,
  className,
}: {
  used: number
  limit: number
  label: string
  className?: string
}) {
  const { pct, isOverLimit } = quotaUsageState(used, limit)
  const dashOffset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Decorative: the adjacent "used / limit" text is the accessible label. */}
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: marked aria-hidden, text label conveys the value */}
      <svg
        aria-hidden
        className="shrink-0 -rotate-90"
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
      >
        <circle
          className="stroke-muted"
          cx={SIZE / 2}
          cy={SIZE / 2}
          fill="none"
          r={RADIUS}
          strokeWidth={STROKE}
        />
        <circle
          className={cn(
            "transition-[stroke-dashoffset]",
            isOverLimit ? "stroke-destructive" : "stroke-primary",
          )}
          cx={SIZE / 2}
          cy={SIZE / 2}
          fill="none"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth={STROKE}
        />
      </svg>
      <div className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-muted-foreground text-xs">{label}</span>
        <span
          className={cn(
            "font-medium text-sm tabular-nums",
            isOverLimit && "text-destructive",
          )}
        >
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
    </div>
  )
}
