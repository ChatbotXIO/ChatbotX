"use client"

import { isRecurringTemplate } from "@chatbotx.io/database/partials"
import { useFormatter, useTranslations } from "next-intl"
import type { BroadcastResourceWithRelations } from "../schema/resource"

const WHEN_FORMAT = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
} as const

type BroadcastSeriesSummaryProps = {
  broadcast: Pick<
    BroadcastResourceWithRelations,
    "status" | "schedulesType" | "occurrenceAt" | "recurrence"
  >
}

/**
 * The line under a repeating broadcast's name: when it runs next, or that it
 * is paused or over. Renders nothing for a one-off, a run, or a series that has
 * no schedule yet (a draft).
 */
export function BroadcastSeriesSummary({
  broadcast,
}: BroadcastSeriesSummaryProps) {
  const t = useTranslations("broadcasts.recurring")
  const format = useFormatter()
  const { recurrence } = broadcast
  if (!(isRecurringTemplate(broadcast) && recurrence)) {
    return null
  }
  const timeZone = recurrence.rule.timezone

  if (recurrence.endedAt) {
    return (
      <span className="text-muted-foreground text-xs">
        {t("ended", {
          when: format.dateTime(recurrence.endedAt, {
            dateStyle: "medium",
            timeZone,
          }),
          count: recurrence.occurrenceCount,
        })}
      </span>
    )
  }
  if (recurrence.pausedAt || broadcast.status === "cancelled") {
    return <span className="text-muted-foreground text-xs">{t("paused")}</span>
  }
  if (recurrence.nextRunAt) {
    // The armed slot can fall on a skipped date; show the next run that sends.
    if (!recurrence.nextSendAt) {
      return (
        <span className="text-muted-foreground text-xs">
          {t("noUpcomingSends")}
        </span>
      )
    }
    return (
      <span className="text-muted-foreground text-xs">
        {t("nextRun", {
          when: format.dateTime(recurrence.nextSendAt, {
            ...WHEN_FORMAT,
            timeZone,
          }),
        })}
      </span>
    )
  }
  return null
}
