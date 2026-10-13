"use client"

import type { BroadcastEventType } from "@chatbotx.io/analytics/schemas"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import type { z } from "zod"
import { orpc } from "@/lib/orpc/query"
import type { listBroadcastOccurrencesPublicResponse } from "../schema/public"
import { BroadcastContactsDialog } from "./broadcast-contacts-dialog"
import { RUN_STAT_EVENTS, RunStatsGrid } from "./broadcast-run-stats-grid"
import { BroadcastStatusBadge } from "./broadcast-status-badge"

type Occurrence = z.output<
  typeof listBroadcastOccurrencesPublicResponse
>["data"][number]

const OCCURRENCES_PER_PAGE = 50
const SKELETON_ROW_KEYS = ["a", "b", "c"] as const
const MS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60
/** A run handled this long after its slot is called out as late. */
const LATE_AFTER_MS = 5 * MS_PER_MINUTE

type ContactsDialogState = {
  broadcastId: string
  eventType: BroadcastEventType
  total: number
}

type BroadcastRunOccurrencesProps = {
  workspaceId: string
  broadcastId: string
  /** ISO instants bounding the period (`to` exclusive). */
  from: string
  to: string
  timezone: string
  /** One run in the period: its numbers get the framed grid instead of inline buttons. */
  framed?: boolean
}

/** The slots of one period, newest first — sent, skipped and missed alike. */
export function BroadcastRunOccurrences({
  workspaceId,
  broadcastId,
  from,
  to,
  timezone,
  framed = false,
}: BroadcastRunOccurrencesProps) {
  const t = useTranslations("broadcasts.runs")
  const [contacts, setContacts] = useState<ContactsDialogState | null>(null)

  const occurrences = useInfiniteQuery(
    orpc.broadcastAPIs.privateListBroadcastOccurrencesAPI.infiniteOptions({
      input: (cursor: string | undefined) => ({
        workspaceId,
        idOrName: broadcastId,
        from: new Date(from),
        to: new Date(to),
        limit: OCCURRENCES_PER_PAGE,
        cursor,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  )

  if (occurrences.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        {SKELETON_ROW_KEYS.map((key) => (
          <Skeleton className="h-9 w-full" key={key} />
        ))}
      </div>
    )
  }

  if (occurrences.isError) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-destructive text-sm" role="alert">
          {t("error")}
        </p>
        <Button
          onClick={() => occurrences.refetch()}
          size="sm"
          variant="outline"
        >
          {t("retry")}
        </Button>
      </div>
    )
  }

  const rows = occurrences.data.pages.flatMap((page) => page.data)

  return (
    <>
      <ul className="flex flex-col divide-y rounded-md border">
        {rows.map((occurrence) => (
          <li
            key={`${occurrence.localSlot}|${occurrence.occurrenceAt.toISOString()}`}
          >
            <OccurrenceRow
              framed={framed}
              occurrence={occurrence}
              onOpenContacts={setContacts}
              timezone={timezone}
            />
          </li>
        ))}
      </ul>
      {occurrences.hasNextPage && (
        <Button
          className="w-fit"
          disabled={occurrences.isFetchingNextPage}
          onClick={() => occurrences.fetchNextPage()}
          size="sm"
          variant="outline"
        >
          {occurrences.isFetchingNextPage && (
            <Loader2Icon className="animate-spin" />
          )}
          {t("loadMore")}
        </Button>
      )}
      <BroadcastContactsDialog
        broadcastId={contacts?.broadcastId ?? ""}
        eventType={contacts?.eventType ?? "message:sent"}
        onOpenChange={(open) => {
          if (!open) {
            setContacts(null)
          }
        }}
        open={contacts !== null}
        total={contacts?.total ?? 0}
        workspaceId={workspaceId}
      />
    </>
  )
}

function OccurrenceRow({
  occurrence,
  timezone,
  framed,
  onOpenContacts,
}: {
  occurrence: Occurrence
  framed: boolean
  timezone: string
  onOpenContacts: (state: ContactsDialogState) => void
}) {
  const t = useTranslations("broadcasts.runs")
  const tStats = useTranslations("broadcasts.stats")
  const format = useFormatter()
  const { run } = occurrence
  const when = format.dateTime(occurrence.occurrenceAt, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  })

  if (!run) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-muted-foreground text-sm">
        <bdi>{when}</bdi>
        <span>
          {t("notSent", {
            reason: occurrence.reason
              ? t(`reasons.${occurrence.reason}`)
              : t(`outcomes.${occurrence.outcome}`),
          })}
        </span>
        {occurrence.supersededCount > 1 && (
          <span>
            {t("earlierSlots", { count: occurrence.supersededCount })}
          </span>
        )}
      </div>
    )
  }

  const lateness = describeLateness(occurrence.latenessMs)

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <bdi>{when}</bdi>
        <BroadcastStatusBadge status={run.status} />
        {run.isStalled && <Badge variant="destructive">{t("stalled")}</Badge>}
        {lateness && (
          <span className="text-muted-foreground">
            {lateness.unit === "hours"
              ? t("lateByHours", { count: lateness.count })
              : t("lateByMinutes", { count: lateness.count })}
          </span>
        )}
        <span className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-muted-foreground">
            {t("recipients", { count: run.contactCount ?? 0 })}
          </span>
          {!framed &&
            RUN_STAT_EVENTS.map(([eventType, labelKey]) => {
              const total = run.stats?.[eventType] ?? 0
              return (
                <ContactsButton
                  count={total}
                  key={eventType}
                  label={tStats(labelKey)}
                  onClick={() =>
                    onOpenContacts({ broadcastId: run.id, eventType, total })
                  }
                />
              )
            })}
        </span>
      </div>
      {framed && (
        <RunStatsGrid
          onSelect={(eventType, total) =>
            onOpenContacts({ broadcastId: run.id, eventType, total })
          }
          stats={run.stats}
        />
      )}
    </div>
  )
}

function ContactsButton({
  count,
  label,
  onClick,
}: {
  count: number
  label: string
  onClick: () => void
}) {
  return (
    <Button
      className="h-auto p-0 font-normal"
      disabled={count === 0}
      onClick={onClick}
      variant="link"
    >
      {label}: {count}
    </Button>
  )
}

const describeLateness = (
  latenessMs: number,
): { unit: "minutes" | "hours"; count: number } | null => {
  if (latenessMs <= LATE_AFTER_MS) {
    return null
  }
  const minutes = Math.round(latenessMs / MS_PER_MINUTE)
  return minutes >= MINUTES_PER_HOUR
    ? { unit: "hours", count: Math.round(minutes / MINUTES_PER_HOUR) }
    : { unit: "minutes", count: minutes }
}
