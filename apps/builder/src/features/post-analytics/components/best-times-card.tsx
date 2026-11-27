"use client"

import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { BEST_TIMES_MIN_TOTAL } from "@chatbotx.io/utils/post-best-times"
import { useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import { orpc } from "@/lib/orpc/query"
import { formatScore } from "../lib/analytics-format"
import { buildHeatmap, type HeatLevel, HOURS, WEEKDAYS } from "../lib/heatmap"
import type { PostAnalyticsScope } from "../lib/search-params"
import { hourName, weekdayName } from "../lib/time-labels"
import {
  AnalyticsSection,
  SectionEmpty,
  SectionError,
} from "./analytics-section"

const LEVEL_CLASS: Record<HeatLevel, string> = {
  0: "bg-muted/40 text-transparent",
  1: "bg-primary/15 text-foreground",
  2: "bg-primary/35 text-foreground",
  3: "bg-primary/65 text-primary-foreground",
  4: "bg-primary text-primary-foreground",
}
const LEGEND_LEVELS: readonly HeatLevel[] = [1, 2, 3, 4]

/** The weekday x hour grid (a real table, so each cell is read with its day and hour). */
export const BestTimesCard = ({
  scope,
  workspaceId,
}: {
  scope: PostAnalyticsScope
  workspaceId: string
}) => {
  const t = useTranslations("posts.analytics.bestTimes")
  const locale = useLocale()
  const query = useQuery(
    orpc.postAnalyticsAPIs.privatePostAnalyticsBestTimesAPI.queryOptions({
      input: {
        channels: scope.channels,
        contentTypes: scope.contentTypes,
        inboxIds: scope.inboxIds,
        topicIds: scope.topicIds,
        workspaceId,
      },
    }),
  )
  const data = query.data
  const grid = useMemo(
    () => (data ? buildHeatmap(data.slots, data.top) : null),
    [data],
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
    if (!(data && grid)) {
      return <Skeleton className="h-64 w-full" />
    }
    if (data.status === "insufficientData") {
      return (
        <SectionEmpty
          hint={t("insufficientHint", {
            count: data.totalPosts,
            min: BEST_TIMES_MIN_TOTAL,
          })}
          title={t("insufficientTitle")}
        />
      )
    }
    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0.5 text-xs">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr>
                <td />
                {HOURS.map((hour) => (
                  <th
                    className="min-w-8 font-normal text-muted-foreground"
                    key={hour}
                    scope="col"
                  >
                    {hour}
                    <span className="sr-only"> ({hourName(hour, locale)})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, rowIndex) => (
                <tr key={WEEKDAYS[rowIndex]}>
                  <th
                    className="whitespace-nowrap pe-2 text-start font-normal text-muted-foreground"
                    scope="row"
                  >
                    {weekdayName(WEEKDAYS[rowIndex] ?? 1, locale, "short")}
                  </th>
                  {row.map((cell) => {
                    const when = `${weekdayName(cell.weekday, locale, "long")} ${hourName(cell.hour, locale)}`
                    return (
                      <td
                        className={cn(
                          "h-8 min-w-8 rounded-sm text-center tabular-nums",
                          LEVEL_CLASS[cell.level],
                          cell.isTop &&
                            "font-semibold ring-2 ring-foreground ring-offset-1 ring-offset-background",
                        )}
                        key={cell.hour}
                      >
                        <span className="sr-only">
                          {cell.score === null
                            ? t("cellEmpty", { when })
                            : t("cell", {
                                posts: cell.sampleSize,
                                score: formatScore(cell.score, locale),
                                when,
                              })}
                        </span>
                        <span aria-hidden="true">
                          {cell.score === null
                            ? ""
                            : formatScore(cell.score, locale)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs">
          <span className="flex items-center gap-1">
            {t("legendLow")}
            {LEGEND_LEVELS.map((level) => (
              <span
                aria-hidden="true"
                className={cn(
                  "inline-block size-4 rounded-sm",
                  LEVEL_CLASS[level],
                )}
                key={level}
              />
            ))}
            {t("legendHigh")}
          </span>
          <span className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block size-4 rounded-sm ring-2 ring-foreground"
            />
            {t("legendTop")}
          </span>
          <span>{t("scoreHint")}</span>
        </div>

        {data.top.length > 0 ? (
          <div>
            <h3 className="mb-2 font-medium text-sm">{t("topHeading")}</h3>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {data.top.map((slot, index) => (
                <li
                  className="rounded-lg border p-3 text-sm"
                  key={`${slot.weekday}:${slot.hour}`}
                >
                  <p className="font-medium">
                    {index + 1}. {weekdayName(slot.weekday, locale, "long")}
                  </p>
                  <p className="text-muted-foreground">
                    {hourName(slot.hour, locale)}
                  </p>
                  <p className="mt-1 text-xs">
                    {t("slotDetail", {
                      posts: slot.sampleSize,
                      score: formatScore(slot.score, locale),
                    })}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {data.capped ? (
          <p className="text-muted-foreground text-xs">{t("capped")}</p>
        ) : null}
      </div>
    )
  }

  return (
    <AnalyticsSection
      description={
        data ? t("description", { timezone: data.timezone }) : undefined
      }
      title={t("title")}
    >
      {renderBody()}
    </AnalyticsSection>
  )
}
