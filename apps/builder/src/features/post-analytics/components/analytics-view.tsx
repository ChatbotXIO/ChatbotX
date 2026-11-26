"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { isPostManagementChannel } from "@chatbotx.io/utils/channel"
import { useQuery } from "@tanstack/react-query"
import { BarChart3Icon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { useInboxListState } from "@/features/inboxes/provider/inbox-hook"
import { orpc } from "@/lib/orpc/query"
import { analyticsSearchParsers, toAnalyticsScope } from "../lib/search-params"
import { AnalyticsFilters } from "./analytics-filters"
import { BestTimesCard } from "./best-times-card"
import { BreakdownCard } from "./breakdown-card"
import { CoverageNotice } from "./coverage-notice"
import { KpiTiles } from "./kpi-tiles"
import { TimeseriesCard } from "./timeseries-card"
import { TopPostsCard } from "./top-posts-card"

const NoChannelState = ({ workspaceId }: { workspaceId: string }) => {
  const t = useTranslations("posts")
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-6 text-center">
      <BarChart3Icon
        aria-hidden="true"
        className="size-8 text-muted-foreground"
      />
      <p className="font-medium">{t("state.noChannelTitle")}</p>
      <p className="text-muted-foreground text-sm">
        {t("analytics.states.noChannelHint")}
      </p>
      <Link
        className={buttonVariants({ size: "sm", variant: "outline" })}
        href={`/space/${workspaceId}/dashboard`}
      >
        {t("state.connectChannel")}
      </Link>
    </div>
  )
}

/**
 * Posts > Analytics. Everything here is a read, so the page works the same in a
 * workspace whose plan has expired.
 */
export const PostAnalyticsView = ({ workspaceId }: { workspaceId: string }) => {
  const t = useTranslations("posts.analytics")
  const [filters, setFilters] = useQueryStates(analyticsSearchParsers, {
    clearOnDefault: true,
  })
  const { inboxes, status } = useInboxListState()
  const scope = toAnalyticsScope(filters)
  const summary = useQuery(
    orpc.postAnalyticsAPIs.privatePostAnalyticsSummaryAPI.queryOptions({
      input: { ...scope, workspaceId },
    }),
  )

  const hasChannel = inboxes.some((inbox) =>
    isPostManagementChannel(inbox.channel),
  )
  if (status === "success" && !hasChannel) {
    return <NoChannelState workspaceId={workspaceId} />
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t("title")}</h1>
      <AnalyticsFilters
        resolved={
          summary.data
            ? { range: summary.data.range, today: summary.data.today }
            : undefined
        }
        workspaceId={workspaceId}
      />
      <CoverageNotice coverage={summary.data?.coverage} />
      <KpiTiles
        metric={filters.metric}
        onSelect={(metric) => setFilters({ metric })}
        query={summary}
      />
      <TimeseriesCard
        groupBy={filters.groupBy}
        metric={filters.metric}
        onGroupByChange={(groupBy) => setFilters({ groupBy })}
        scope={scope}
        workspaceId={workspaceId}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownCard
          metric={filters.metric}
          scope={scope}
          workspaceId={workspaceId}
        />
        <TopPostsCard
          metric={filters.metric}
          onRankByChange={(rankBy) => setFilters({ rankBy })}
          rankBy={filters.rankBy}
          scope={scope}
          workspaceId={workspaceId}
        />
      </div>
      <BestTimesCard scope={scope} workspaceId={workspaceId} />
    </div>
  )
}
