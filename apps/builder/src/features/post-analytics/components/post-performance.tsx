"use client"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { useFormatter, useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { orpc } from "@/lib/orpc/query"
import { formatCount, formatGain, NO_VALUE } from "../lib/analytics-format"
import { METRIC_LABEL_KEYS, METRIC_LOWER_LABEL_KEYS } from "../lib/label-keys"
import { enumerateDays } from "../lib/series"
import type { PostMetricNameValue, PostMetricsResponse } from "../schema"
import { ChoiceButtons, SectionEmpty, SectionError } from "./analytics-section"
import { METRIC_ORDER } from "./kpi-tiles"

const CHART_CONFIG = {
  gain: { color: "var(--chart-1)", label: "" },
} satisfies ChartConfig

/** The headline and the daily gain bars of one post's metrics, for the chosen metric. */
export const PostMetricsView = ({
  data,
  metric,
}: {
  data: PostMetricsResponse
  metric: PostMetricNameValue
}) => {
  const t = useTranslations("posts.analytics")
  const locale = useLocale()
  const format = useFormatter()
  const current = data.metrics[metric]

  const renderBody = () => {
    if (!current.available) {
      return (
        <p className="text-muted-foreground text-sm">
          {t("perPost.notReported")}
        </p>
      )
    }
    const gains = new Map(
      data.points.map((point) => [point.day, point[metric].gain]),
    )
    const days = enumerateDays(data.range.from, data.range.to).map((day) => ({
      day,
      gain: gains.get(day) ?? 0,
    }))
    if (!days.some((point) => point.gain !== 0)) {
      return (
        <SectionEmpty
          hint={
            data.firstSnapshotDay
              ? t("perPost.since", {
                  date: format.dateTime(
                    new Date(`${data.firstSnapshotDay}T00:00:00`),
                    { dateStyle: "medium" },
                  ),
                })
              : t("perPost.notTracked")
          }
          title={t("perPost.empty")}
        />
      )
    }
    const dayFormat = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
    })
    return (
      <div
        aria-label={t("perPost.summary", {
          metric: t(METRIC_LABEL_KEYS[metric]),
          metricLower: t(METRIC_LOWER_LABEL_KEYS[metric]),
          total: formatGain(current.gained, locale),
        })}
        role="img"
      >
        <ChartContainer
          className="h-40 w-full"
          config={{
            gain: { ...CHART_CONFIG.gain, label: t(METRIC_LABEL_KEYS[metric]) },
          }}
        >
          <BarChart data={days}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              minTickGap={24}
              tickFormatter={(day: string) =>
                dayFormat.format(new Date(`${day}T00:00:00`))
              }
              tickMargin={6}
            />
            <YAxis
              tickFormatter={(value: number) => formatCount(value, locale)}
              width="auto"
            />
            <Bar dataKey="gain" fill="var(--chart-1)" radius={2} />
            <ChartTooltip content={<ChartTooltipContent />} />
          </BarChart>
        </ChartContainer>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {current.available ? (
        <p className="text-sm">
          <span className="font-semibold text-lg tabular-nums">
            {formatGain(current.gained, locale)}
          </span>{" "}
          <span className="text-muted-foreground">
            {t("perPost.totalNow", {
              total:
                current.total === null
                  ? NO_VALUE
                  : formatCount(current.total, locale),
            })}
          </span>
        </p>
      ) : null}
      {renderBody()}
    </div>
  )
}

/** The metric choice shared by every chart of a performance panel. */
export const MetricChoice = ({
  onChange,
  value,
}: {
  onChange: (metric: PostMetricNameValue) => void
  value: PostMetricNameValue
}) => {
  const t = useTranslations("posts.analytics")
  return (
    <ChoiceButtons
      ariaLabel={t("perPost.metric")}
      choices={METRIC_ORDER.map((metric) => ({
        label: t(METRIC_LABEL_KEYS[metric]),
        value: metric,
      }))}
      onChange={onChange}
      value={value}
    />
  )
}

/** The daily gain of one synced post, from our own daily snapshots of its counts. */
export const PostPerformance = ({
  postId,
  workspaceId,
}: {
  postId: string
  workspaceId: string
}) => {
  const [metric, setMetric] = useState<PostMetricNameValue>("engagement")
  const query = useQuery(
    orpc.postAnalyticsAPIs.privateChannelPostMetricsAPI.queryOptions({
      input: { id: postId, workspaceId },
    }),
  )

  const renderBody = () => {
    if (query.isError) {
      return (
        <SectionError
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      )
    }
    return query.data ? (
      <PostMetricsView data={query.data} metric={metric} />
    ) : (
      <Skeleton className="h-40 w-full" />
    )
  }

  return (
    <div className="space-y-3">
      <MetricChoice onChange={setMetric} value={metric} />
      {renderBody()}
    </div>
  )
}
