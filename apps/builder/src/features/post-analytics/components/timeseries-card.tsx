"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useQuery } from "@tanstack/react-query"
import { TableIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useCallback, useMemo, useState } from "react"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import { orpc } from "@/lib/orpc/query"
import { formatGain } from "../lib/analytics-format"
import { seriesLabel } from "../lib/group-labels"
import {
  GROUP_LABEL_KEYS,
  METRIC_LABEL_KEYS,
  METRIC_LOWER_LABEL_KEYS,
} from "../lib/label-keys"
import type { PostAnalyticsScope } from "../lib/search-params"
import { mergeSeries } from "../lib/series"
import type { PostAnalyticsGroupByValue, PostMetricNameValue } from "../schema"
import {
  AnalyticsSection,
  ChoiceButtons,
  SectionEmpty,
  SectionError,
} from "./analytics-section"
import {
  ChartSkeleton,
  DailyGainChart,
  DailyGainTable,
} from "./timeseries-chart"

const GROUP_CHOICES: readonly PostAnalyticsGroupByValue[] = [
  "none",
  "channel",
  "inbox",
]

export const TimeseriesCard = ({
  groupBy,
  metric,
  onGroupByChange,
  scope,
  workspaceId,
}: {
  groupBy: PostAnalyticsGroupByValue
  metric: PostMetricNameValue
  onGroupByChange: (groupBy: PostAnalyticsGroupByValue) => void
  scope: PostAnalyticsScope
  workspaceId: string
}) => {
  const t = useTranslations("posts.analytics")
  const locale = useLocale()
  const inboxes = useInboxList()
  const [showTable, setShowTable] = useState(false)
  const query = useQuery(
    orpc.postAnalyticsAPIs.privatePostAnalyticsTimeseriesAPI.queryOptions({
      input: { ...scope, groupBy, metric, workspaceId },
    }),
  )
  const data = query.data

  const labelOf = useCallback(
    (key: string) =>
      seriesLabel(key, groupBy, inboxes, {
        all: t("chart.group.none"),
        other: t("chart.other"),
      }),
    [groupBy, inboxes, t],
  )
  const merged = useMemo(() => (data ? mergeSeries(data.series) : null), [data])
  const metricName = t(METRIC_LABEL_KEYS[metric])
  const metricLower = t(METRIC_LOWER_LABEL_KEYS[metric])
  const summary = data
    ? t("chart.summary", {
        from: data.range.from,
        metric: metricName,
        metricLower,
        to: data.range.to,
        total: formatGain(merged?.total ?? 0, locale),
      })
    : ""
  const hasGain = merged?.rows.some((row) =>
    merged.keys.some((key) => Number(row[key] ?? 0) !== 0),
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
    if (!(data && merged)) {
      return <ChartSkeleton />
    }
    if (!data.available) {
      return (
        <SectionEmpty
          hint={t("kpi.notReportedHint")}
          title={t("kpi.notReported")}
        />
      )
    }
    if (!hasGain) {
      return (
        <SectionEmpty hint={t("chart.emptyHint")} title={t("chart.empty")} />
      )
    }
    return (
      <div className="space-y-3">
        <DailyGainChart labelOf={labelOf} merged={merged} summary={summary} />
        <Button
          aria-expanded={showTable}
          onClick={() => setShowTable((value) => !value)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <TableIcon />
          {showTable ? t("chart.hideTable") : t("chart.viewTable")}
        </Button>
        {showTable ? (
          <DailyGainTable caption={summary} labelOf={labelOf} merged={merged} />
        ) : null}
      </div>
    )
  }

  return (
    <AnalyticsSection
      action={
        <ChoiceButtons
          ariaLabel={t("chart.groupBy")}
          choices={GROUP_CHOICES.map((value) => ({
            label: t(GROUP_LABEL_KEYS[value]),
            value,
          }))}
          onChange={onGroupByChange}
          value={groupBy}
        />
      }
      description={t("chart.description", { metric: metricName, metricLower })}
      title={t("chart.title")}
    >
      {renderBody()}
    </AnalyticsSection>
  )
}
