"use client"

import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { getChannelOptionIcon } from "@/features/channel-posts/lib/post-filter-options"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import { orpc } from "@/lib/orpc/query"
import { formatGain } from "../lib/analytics-format"
import { seriesChannel, seriesLabel } from "../lib/group-labels"
import {
  BREAKDOWN_LABEL_KEYS,
  METRIC_LABEL_KEYS,
  METRIC_LOWER_LABEL_KEYS,
} from "../lib/label-keys"
import type { PostAnalyticsScope } from "../lib/search-params"
import type { PostAnalyticsGroupByValue, PostMetricNameValue } from "../schema"
import {
  AnalyticsSection,
  ChoiceButtons,
  SectionEmpty,
  SectionError,
} from "./analytics-section"

type BreakdownGroup = Exclude<PostAnalyticsGroupByValue, "none">

const GROUPS: readonly BreakdownGroup[] = ["channel", "inbox"]
const SKELETON_KEYS = ["a", "b", "c", "d", "e"].slice(0, 4)

/** The gain of each channel, or of each page / account, over the range, as bars. */
export const BreakdownCard = ({
  metric,
  scope,
  workspaceId,
}: {
  metric: PostMetricNameValue
  scope: PostAnalyticsScope
  workspaceId: string
}) => {
  const t = useTranslations("posts.analytics")
  const locale = useLocale()
  const inboxes = useInboxList()
  const [group, setGroup] = useState<BreakdownGroup>("channel")
  const query = useQuery(
    orpc.postAnalyticsAPIs.privatePostAnalyticsTimeseriesAPI.queryOptions({
      input: { ...scope, groupBy: group, metric, workspaceId },
    }),
  )

  const rows = (query.data?.series ?? [])
    .map((entry) => ({
      key: entry.key,
      total: entry.points.reduce((sum, point) => sum + point.gain, 0),
    }))
    .sort((a, b) => b.total - a.total)
  const widest = rows.reduce(
    (max, row) => Math.max(max, Math.abs(row.total)),
    0,
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
    if (!query.data) {
      return (
        <div className="space-y-3">
          {SKELETON_KEYS.map((key) => (
            <Skeleton className="h-8 w-full" key={key} />
          ))}
        </div>
      )
    }
    if (!query.data.available) {
      return (
        <SectionEmpty
          hint={t("kpi.notReportedHint")}
          title={t("kpi.notReported")}
        />
      )
    }
    if (rows.length === 0) {
      return <SectionEmpty title={t("breakdown.empty")} />
    }
    return (
      <ul className="space-y-3">
        {rows.map((row) => {
          const channel = seriesChannel(row.key, group, inboxes)
          const ChannelIcon = channel
            ? getChannelOptionIcon(channel)
            : undefined
          const label = seriesLabel(row.key, group, inboxes, {
            all: "",
            other: "",
          })
          return (
            <li key={row.key}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {ChannelIcon ? (
                    <ChannelIcon className="size-4 shrink-0" />
                  ) : null}
                  <span className="truncate">{label}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatGain(row.total, locale)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-1 h-1.5 rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${widest > 0 ? (Math.abs(row.total) / widest) * 100 : 0}%`,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <AnalyticsSection
      action={
        <ChoiceButtons
          ariaLabel={t("breakdown.title")}
          choices={GROUPS.map((value) => ({
            label: t(BREAKDOWN_LABEL_KEYS[value]),
            value,
          }))}
          onChange={setGroup}
          value={group}
        />
      }
      description={t("breakdown.description", {
        metric: t(METRIC_LABEL_KEYS[metric]),
        metricLower: t(METRIC_LOWER_LABEL_KEYS[metric]),
      })}
      title={t("breakdown.title")}
    >
      {renderBody()}
    </AnalyticsSection>
  )
}
