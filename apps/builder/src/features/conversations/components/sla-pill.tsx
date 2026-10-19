"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useFormatter, useTranslations } from "next-intl"
import { useResponseSlaEnabled } from "@/features/response-sla/provider/response-sla-hook"
import { useNow } from "@/hooks/use-now"

type SlaPillProps = {
  responseDueAt: Date | null | undefined
  responseSlaBreachingAt: Date | null | undefined
}

/**
 * Response-SLA state of an open waiting window: "Overdue" past the deadline,
 * "<time> left" once inside the breaching threshold, nothing before that (a
 * window with plenty of time stays quiet) or when no SLA applies.
 */
export function SlaPill({
  responseDueAt,
  responseSlaBreachingAt,
}: SlaPillProps) {
  const t = useTranslations()
  const format = useFormatter()
  // Shared minute tick: the pill flips to breaching/overdue without a refetch.
  const nowMs = useNow()
  // Snapshots loaded before the SLA was switched off must not keep showing.
  const slaEnabled = useResponseSlaEnabled()
  if (!(slaEnabled && responseDueAt && responseSlaBreachingAt)) {
    return null
  }
  const overdue = responseDueAt.getTime() <= nowMs
  if (!overdue && responseSlaBreachingAt.getTime() > nowMs) {
    return null
  }

  return (
    <Badge
      className="shrink-0 rounded px-1.5 py-0 font-medium text-[10px] leading-4"
      data-sla-state={overdue ? "overdue" : "breaching"}
      suppressHydrationWarning
      variant={overdue ? "destructive" : "outline"}
    >
      {overdue
        ? t("responseSla.overdue")
        : t("responseSla.due", {
            time: format.relativeTime(responseDueAt, new Date(nowMs)),
          })}
    </Badge>
  )
}
