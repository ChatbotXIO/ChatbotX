"use client"

import { useFormatter, useTranslations } from "next-intl"
import { useNow } from "@/hooks/use-now"
import { type ShortTimeUnit, shortTimeAgo } from "../lib/short-time-ago"

const AGE_LABEL_KEY: Record<Exclude<ShortTimeUnit, "now">, string> = {
  minute: "messages.timeAgo.minutes",
  hour: "messages.timeAgo.hours",
  day: "messages.timeAgo.days",
  month: "messages.timeAgo.months",
  year: "messages.timeAgo.years",
}

const EXACT_TIME_FORMAT = { dateStyle: "medium", timeStyle: "short" } as const

/**
 * "5m" / "3h" / "8d" for a last activity time (never seconds — see
 * `shortTimeAgo`), with the exact time as the tooltip, re-rendered on the
 * shared minute tick so lists and headers keep up with the clock without anyone
 * touching it. Isolated in its own component so the tick re-renders only
 * this text, not its whole row or header.
 */
export function LastActivityAgo({ at }: { at: Date | string }) {
  const t = useTranslations()
  const format = useFormatter()
  const now = useNow()
  const date = new Date(at)
  const age = shortTimeAgo(date, now)
  return (
    <time
      dateTime={date.toISOString()}
      title={format.dateTime(date, EXACT_TIME_FORMAT)}
    >
      {age.unit === "now"
        ? t("messages.timeAgo.now")
        : t(AGE_LABEL_KEY[age.unit], { count: age.count })}
    </time>
  )
}
