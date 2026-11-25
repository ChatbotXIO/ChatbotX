"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"

/**
 * The free posting times of a day as light markers: a click opens the composer
 * at that time (the `?at=` link the day's plus button uses).
 */
export const FreeSlotMarkers = ({
  className,
  slots,
  timezone,
  workspaceId,
}: {
  className?: string
  slots: readonly Date[]
  timezone: string
  workspaceId: string
}) => {
  const t = useTranslations()
  const format = useFormatter()
  if (slots.length === 0) {
    return null
  }
  return (
    <ul
      aria-label={t("posts.calendar.freeSlots.label")}
      className={cn("flex flex-wrap gap-1", className)}
    >
      {slots.map((slot) => {
        const time = format.dateTime(slot, {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: timezone,
        })
        return (
          <li key={slot.getTime()}>
            <Link
              aria-label={t("posts.calendar.freeSlots.compose", { time })}
              className="inline-flex items-center rounded border border-primary/40 border-dashed px-1.5 py-0.5 text-[11px] text-primary/70 tabular-nums outline-none hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
              href={`/space/${workspaceId}/posts/create?at=${encodeURIComponent(slot.toISOString())}`}
              title={t("posts.calendar.freeSlots.compose", { time })}
            >
              {time}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
