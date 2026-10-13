"use client"

import type { OccurrenceBucketGranularity } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronDownIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useId, useState } from "react"
import type { z } from "zod"
import type { listBroadcastRunGroupsPublicResponse } from "../schema/public"
import { BroadcastRunOccurrences } from "./broadcast-run-occurrences"
import { RunStatsGrid } from "./broadcast-run-stats-grid"
import { BroadcastStatusBadge } from "./broadcast-status-badge"

type RunGroup = z.output<
  typeof listBroadcastRunGroupsPublicResponse
>["data"][number]

type BroadcastRunGroupProps = {
  group: RunGroup
  groupBy: OccurrenceBucketGranularity
  timezone: string
  workspaceId: string
  broadcastId: string
}

/** One day, week or month of a series: a summary line that opens into its slots. */
export function BroadcastRunGroup({
  group,
  groupBy,
  timezone,
  workspaceId,
  broadcastId,
}: BroadcastRunGroupProps) {
  const t = useTranslations()
  const format = useFormatter()
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const start = new Date(group.periodStartAt)
  const periodLabel =
    groupBy === "month"
      ? format.dateTime(start, {
          month: "long",
          year: "numeric",
          timeZone: timezone,
        })
      : format.dateTime(start, { dateStyle: "medium", timeZone: timezone })
  const sent = group.stats["message:sent"] ?? 0
  const delivered = group.stats["message:delivered"] ?? 0

  return (
    <section className="rounded-md border">
      <button
        // The panel only exists while open, so a collapsed toggle controls nothing.
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-3 text-start text-sm hover:bg-accent/50"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-transform",
            !open && "-rotate-90 rtl:rotate-90",
          )}
        />
        <span className="min-w-32 font-medium">
          {groupBy === "week"
            ? t("broadcasts.runs.weekOf", { date: periodLabel })
            : periodLabel}
        </span>
        <span className="text-muted-foreground">
          {t("broadcasts.runs.groupSummary", {
            created: group.createdCount,
            missed: group.missedCount,
            skipped: group.skippedCount,
          })}
        </span>
        {sent > 0 && (
          <span className="ms-auto text-muted-foreground">
            {t("broadcasts.runs.deliveredRate", {
              rate: format.number(delivered / sent, { style: "percent" }),
            })}
          </span>
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t p-3" id={panelId}>
          {/* With one run its own framed numbers (below) are the totals. */}
          {group.createdCount > 1 && <RunStatsGrid stats={group.stats} />}
          {group.createdCount > 1 && (
            <ul className="flex flex-wrap gap-2">
              {Object.entries(group.runStateCounts).map(([status, count]) => (
                <li className="flex items-center gap-1 text-xs" key={status}>
                  <BroadcastStatusBadge status={status} />
                  <span className="text-muted-foreground">
                    {format.number(count)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <BroadcastRunOccurrences
            broadcastId={broadcastId}
            framed={group.createdCount === 1}
            from={group.periodStartAt}
            timezone={timezone}
            to={group.periodEndAt}
            workspaceId={workspaceId}
          />
        </div>
      )}
    </section>
  )
}
