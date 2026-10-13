"use client"

import type { BroadcastEventType } from "@chatbotx.io/analytics/schemas"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useFormatter, useTranslations } from "next-intl"

/** The recipient lists a run can open, in the order of the stats elsewhere. */
export const RUN_STAT_EVENTS = [
  ["message:sent", "sent"],
  ["message:delivered", "delivered"],
  ["message:seen", "seen"],
  ["flow:clicked", "clicked"],
  ["message:failed", "failed"],
] as const satisfies readonly (readonly [BroadcastEventType, string])[]

type RunStatsGridProps = {
  stats: Partial<Record<BroadcastEventType, number>> | undefined
  /** Makes each non-zero number open its recipients; without it the grid is a plain total. */
  onSelect?: (eventType: BroadcastEventType, total: number) => void
}

/** The five delivery numbers of a run, or the totals of several. */
export function RunStatsGrid({ stats, onSelect }: RunStatsGridProps) {
  const t = useTranslations("broadcasts.stats")
  const format = useFormatter()

  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
      {RUN_STAT_EVENTS.map(([eventType, labelKey]) => {
        const total = stats?.[eventType] ?? 0
        return (
          <div key={eventType}>
            <dt className="text-muted-foreground text-xs">{t(labelKey)}</dt>
            <dd className="font-medium">
              {onSelect ? (
                <Button
                  aria-label={`${t(labelKey)}: ${total}`}
                  className="h-auto p-0 font-medium"
                  disabled={total === 0}
                  onClick={() => onSelect(eventType, total)}
                  variant="link"
                >
                  {format.number(total)}
                </Button>
              ) : (
                format.number(total)
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
