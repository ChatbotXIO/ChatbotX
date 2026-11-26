"use client"

import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { cn } from "@chatbotx.io/ui/lib/utils"
import type { UseQueryResult } from "@tanstack/react-query"
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  EyeIcon,
  type LucideIcon,
  MessageCircleIcon,
  MinusIcon,
  Share2Icon,
  SmileIcon,
  ZapIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import {
  type ChangeDirection,
  changeDirection,
  formatChangePercent,
  formatGain,
  NO_VALUE,
} from "../lib/analytics-format"
import { METRIC_LABEL_KEYS } from "../lib/label-keys"
import type {
  PostAnalyticsSummaryResponse,
  PostMetricNameValue,
} from "../schema"
import { SectionError } from "./analytics-section"

export const METRIC_ORDER: readonly PostMetricNameValue[] = [
  "comments",
  "reactions",
  "shares",
  "engagement",
  "views",
]

const METRIC_ICONS: Record<PostMetricNameValue, LucideIcon> = {
  comments: MessageCircleIcon,
  engagement: ZapIcon,
  reactions: SmileIcon,
  shares: Share2Icon,
  views: EyeIcon,
}

/** Words next to the arrow, so the trend is never told by the colour alone. */
const DIRECTION_STYLE: Record<
  ChangeDirection,
  { className: string; icon: LucideIcon }
> = {
  down: {
    className: "text-red-600 dark:text-red-400",
    icon: ArrowDownRightIcon,
  },
  flat: { className: "text-muted-foreground", icon: MinusIcon },
  unknown: { className: "text-muted-foreground", icon: MinusIcon },
  up: {
    className: "text-emerald-700 dark:text-emerald-400",
    icon: ArrowUpRightIcon,
  },
}

type Summary = PostAnalyticsSummaryResponse["metrics"][number]

const Tile = ({
  metric,
  onSelect,
  selected,
  summary,
}: {
  metric: PostMetricNameValue
  onSelect: (metric: PostMetricNameValue) => void
  selected: boolean
  summary: Summary | undefined
}) => {
  const t = useTranslations("posts.analytics")
  const locale = useLocale()
  const MetricIcon = METRIC_ICONS[metric]
  const available = summary?.available ?? false
  const direction = changeDirection(
    available ? (summary?.changePercent ?? null) : null,
  )
  const { className, icon: TrendIcon } = DIRECTION_STYLE[direction]
  const change = formatChangePercent(summary?.changePercent ?? null, locale)

  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-4 text-start outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-primary/5",
      )}
      onClick={() => onSelect(metric)}
      type="button"
    >
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <MetricIcon aria-hidden="true" className="size-3.5" />
        {t(METRIC_LABEL_KEYS[metric])}
      </span>
      {available && summary ? (
        <>
          <span className="font-semibold text-2xl tabular-nums">
            {formatGain(summary.total, locale)}
          </span>
          <span className={cn("flex items-center gap-1 text-xs", className)}>
            <TrendIcon aria-hidden="true" className="size-3.5" />
            <span>{change}</span>
            <span className="sr-only">
              {direction === "unknown"
                ? t("kpi.noComparison")
                : t("kpi.vsPrevious")}
            </span>
          </span>
          <span className="text-muted-foreground text-xs">
            {direction === "unknown"
              ? t("kpi.noComparison")
              : t("kpi.previous", {
                  value: formatGain(summary.previousTotal, locale),
                })}
          </span>
        </>
      ) : (
        <>
          <span className="font-semibold text-muted-foreground text-xl">
            {summary ? t("kpi.notReported") : NO_VALUE}
          </span>
          <span className="text-muted-foreground text-xs">
            {summary ? t("kpi.notReportedHint") : " "}
          </span>
        </>
      )}
    </button>
  )
}

/** One tile per metric: the gain over the range and its change against the previous period. */
export const KpiTiles = ({
  metric,
  onSelect,
  query,
}: {
  metric: PostMetricNameValue
  onSelect: (metric: PostMetricNameValue) => void
  query: UseQueryResult<PostAnalyticsSummaryResponse>
}) => {
  const t = useTranslations("posts.analytics")
  if (query.isError) {
    return (
      <div className="rounded-xl border bg-card">
        <SectionError
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    )
  }
  return (
    <section aria-label={t("kpi.title")} className="space-y-2">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {METRIC_ORDER.map((name) => (
          <li className="min-w-0" key={name}>
            {query.data ? (
              <Tile
                metric={name}
                onSelect={onSelect}
                selected={metric === name}
                summary={query.data.metrics.find(
                  (item) => item.metric === name,
                )}
              />
            ) : (
              <Skeleton className="h-[7.5rem] w-full rounded-xl" />
            )}
          </li>
        ))}
      </ul>
      {query.data ? (
        <p className="text-muted-foreground text-xs">
          {t("kpi.postsPublished", { count: query.data.postsPublished })}
        </p>
      ) : null}
    </section>
  )
}
