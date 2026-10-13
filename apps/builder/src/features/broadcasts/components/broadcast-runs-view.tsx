"use client"

import {
  type OccurrenceBucketGranularity,
  occurrenceBucketGranularities,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@chatbotx.io/ui/components/ui/toggle-group"
import { useInfiniteQuery } from "@tanstack/react-query"
import { ArrowLeftIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { parseAsStringEnum, useQueryState } from "nuqs"
import { orpc } from "@/lib/orpc/query"
import type { BroadcastResourceWithRelations } from "../schema/resource"
import { BroadcastRunGroup } from "./broadcast-run-group"
import { BroadcastRunUpcoming } from "./broadcast-run-upcoming"
import { BroadcastSeriesSummary } from "./broadcast-series-summary"
import { BroadcastStatusBadge } from "./broadcast-status-badge"

const GROUPS_PER_PAGE = 31
const SKELETON_ROW_KEYS = ["a", "b", "c", "d"] as const

type BroadcastRunsViewProps = {
  broadcast: BroadcastResourceWithRelations
  workspaceId: string
}

/**
 * The runs of one repeating broadcast, grouped by day, week or month. The
 * grouping lives in the URL so a view can be shared; every group lists its
 * slots when opened, including the ones that were not sent and why.
 */
export function BroadcastRunsView({
  broadcast,
  workspaceId,
}: BroadcastRunsViewProps) {
  const t = useTranslations("broadcasts.runs")
  const format = useFormatter()
  const [groupBy, setGroupBy] = useQueryState(
    "groupBy",
    parseAsStringEnum([...occurrenceBucketGranularities]).withDefault("day"),
  )

  const groups = useInfiniteQuery(
    orpc.broadcastAPIs.privateListBroadcastRunGroupsAPI.infiniteOptions({
      input: (cursor: string | undefined) => ({
        workspaceId,
        idOrName: broadcast.id,
        groupBy,
        limit: GROUPS_PER_PAGE,
        cursor,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  )

  const pages = groups.data?.pages ?? []
  const rows = pages.flatMap((page) => page.data)
  const timezone = pages[0]?.timezone ?? broadcast.recurrence?.rule.timezone
  const totals = pages[0]

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <Button
          className="w-fit"
          nativeButton={false}
          render={
            <Link href={`/space/${workspaceId}/broadcasts?kind=repeating`} />
          }
          size="sm"
          variant="ghost"
        >
          <ArrowLeftIcon aria-hidden="true" className="rtl:rotate-180" />
          {t("back")}
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-bold text-xl">{broadcast.name}</h1>
          <BroadcastStatusBadge
            occurrenceAt={broadcast.occurrenceAt}
            schedulesType={broadcast.schedulesType}
            status={broadcast.status}
          />
        </div>
        <BroadcastSeriesSummary broadcast={broadcast} />
        {broadcast.recurrence?.pausedAt && (
          <p
            className="rounded-md bg-amber-50 p-3 text-amber-800 text-sm dark:bg-amber-950 dark:text-amber-200"
            role="status"
          >
            {t("pausedNotice", {
              when: format.dateTime(broadcast.recurrence.pausedAt, {
                dateStyle: "medium",
              }),
            })}
          </p>
        )}
      </header>

      <BroadcastRunUpcoming broadcast={broadcast} workspaceId={workspaceId} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          aria-label={t("groupBy")}
          onValueChange={(values) => {
            const next = values[0]
            if (next) {
              setGroupBy(next as OccurrenceBucketGranularity)
            }
          }}
          value={[groupBy]}
          variant="outline"
        >
          {occurrenceBucketGranularities.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {t(`grouping.${value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {totals && (
          <p className="text-muted-foreground text-sm">
            {t("totals", { runs: totals.totalRuns, slots: totals.totalSlots })}
          </p>
        )}
      </div>

      {groups.isPending && (
        <div aria-busy="true" className="flex flex-col gap-2">
          {SKELETON_ROW_KEYS.map((key) => (
            <Skeleton className="h-14 w-full" key={key} />
          ))}
        </div>
      )}

      {groups.isError && (
        <div className="flex flex-col items-start gap-3 rounded-md border p-4">
          <p className="text-destructive text-sm" role="alert">
            {t("error")}
          </p>
          <Button onClick={() => groups.refetch()} size="sm" variant="outline">
            {t("retry")}
          </Button>
        </div>
      )}

      {groups.isSuccess && rows.length === 0 && (
        <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
          {t("empty")}
        </p>
      )}

      {rows.length > 0 && timezone && (
        <ul className="flex flex-col gap-2">
          {rows.map((group) => (
            <li key={group.periodStart}>
              <BroadcastRunGroup
                broadcastId={broadcast.id}
                group={group}
                groupBy={groupBy}
                timezone={timezone}
                workspaceId={workspaceId}
              />
            </li>
          ))}
        </ul>
      )}

      {groups.hasNextPage && (
        <Button
          className="w-fit self-center"
          disabled={groups.isFetchingNextPage}
          onClick={() => groups.fetchNextPage()}
          variant="outline"
        >
          {groups.isFetchingNextPage && (
            <Loader2Icon className="animate-spin" />
          )}
          {t("loadMore")}
        </Button>
      )}
    </div>
  )
}
