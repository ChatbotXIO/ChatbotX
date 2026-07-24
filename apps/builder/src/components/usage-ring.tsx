import { cn } from "@chatbotx.io/ui/lib/utils"
import { useFormatter, useTranslations } from "next-intl"
import { quotaUsageState } from "@/lib/quota-metrics"

const SIZE = 32
const STROKE = 3
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Presentational circular usage ring (ManyChat-style) for the sidebar footer.
 * Like {@link UsageBars} the caller owns label resolution; numbers are
 * formatted via next-intl so server and client render the same text (works in
 * both RSC and client trees). The ring fills clockwise from the top; the
 * track turns destructive once usage reaches the limit.
 */
export function UsageRing({
  used,
  limit,
  label,
  workspaceUsed,
  className,
}: {
  used: number
  limit: number
  label: string
  workspaceUsed?: number
  className?: string
}) {
  const formatter = useFormatter()
  const t = useTranslations("billing.usage")
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
          {formatter.number(used)} / {formatter.number(limit)}
        </span>
        {workspaceUsed !== undefined && (
          <span className="text-muted-foreground text-xs">
            {t("thisWorkspace", { workspace: formatter.number(workspaceUsed) })}
          </span>
        )}
      </div>
    </div>
  )
}
