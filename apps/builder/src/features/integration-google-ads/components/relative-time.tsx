"use client"

import { useFormatter } from "next-intl"

/** Relative phrase ("2 hours ago") with the exact moment as a tooltip and machine-readable value. */
export const RelativeTime = ({ date }: { date: Date }) => {
  const format = useFormatter()
  return (
    <time
      dateTime={date.toISOString()}
      suppressHydrationWarning
      title={format.dateTime(date, { dateStyle: "medium", timeStyle: "short" })}
    >
      {format.relativeTime(date, new Date())}
    </time>
  )
}
