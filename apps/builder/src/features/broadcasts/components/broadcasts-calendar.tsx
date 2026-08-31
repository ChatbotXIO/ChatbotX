"use client"

import type { BroadcastCalendarRow } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { addMonths, format, isSameMonth, isToday, subMonths } from "date-fns"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { useMemo, useState } from "react"
import { BroadcastDetailDialog } from "../broadcast-detail-dialog"
import {
  broadcastStatusConfig,
  parseBroadcastStatus,
} from "../lib/broadcast-status"
import {
  buildMonthGrid,
  dayKey,
  groupByDay,
  MONTH_PARAM_FORMAT,
  parseMonthParam,
} from "../lib/calendar-grid"
import { broadcastsSearchParsers } from "../schema/search-parsers"

const MAX_CHIPS_PER_DAY = 3

export function BroadcastsCalendar({
  month,
  broadcasts,
}: {
  month: string
  broadcasts: BroadcastCalendarRow[]
}) {
  const t = useTranslations()
  const formatter = useFormatter()
  const [, setQuery] = useQueryStates(
    { month: broadcastsSearchParsers.month },
    { shallow: false, clearOnDefault: true },
  )
  const monthDate = useMemo(() => parseMonthParam(month), [month])
  const weeks = useMemo(() => buildMonthGrid(monthDate), [monthDate])
  const byDay = useMemo(() => groupByDay(broadcasts), [broadcasts])
  const [selected, setSelected] = useState<BroadcastCalendarRow | null>(null)

  const goTo = (date: Date | null) => {
    setQuery({ month: date ? format(date, MONTH_PARAM_FORMAT) : null })
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">
          {formatter.dateTime(monthDate, { month: "long", year: "numeric" })}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            aria-label={t("broadcasts.calendar.previousMonth")}
            onClick={() => goTo(subMonths(monthDate, 1))}
            size="icon"
            variant="outline"
          >
            <ChevronLeftIcon />
          </Button>
          <Button onClick={() => goTo(null)} size="sm" variant="outline">
            {t("broadcasts.calendar.today")}
          </Button>
          <Button
            aria-label={t("broadcasts.calendar.nextMonth")}
            onClick={() => goTo(addMonths(monthDate, 1))}
            size="icon"
            variant="outline"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
        {weeks[0].map((day) => (
          <div
            className="border-b bg-muted px-2 py-1.5 font-medium text-muted-foreground text-xs"
            key={`weekday-${dayKey(day)}`}
          >
            {formatter.dateTime(day, { weekday: "short" })}
          </div>
        ))}
        {weeks.flat().map((day) => {
          const rows = byDay.get(dayKey(day)) ?? []
          const overflow = rows.length - MAX_CHIPS_PER_DAY
          return (
            <div
              className={cn(
                "flex min-h-28 flex-col gap-1 border-e border-b p-1.5",
                !isSameMonth(day, monthDate) &&
                  "bg-muted/40 text-muted-foreground",
              )}
              key={dayKey(day)}
            >
              <span
                className={cn(
                  "self-end text-xs",
                  isToday(day) &&
                    "rounded-full bg-primary px-1.5 text-primary-foreground",
                )}
              >
                {day.getDate()}
              </span>
              {rows.slice(0, MAX_CHIPS_PER_DAY).map((row) => {
                const parsedStatus = parseBroadcastStatus(row.status)
                return (
                  <button
                    className="flex items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-start text-xs hover:bg-accent"
                    key={row.id}
                    onClick={() => setSelected(row)}
                    type="button"
                  >
                    {parsedStatus && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          broadcastStatusConfig[parsedStatus].dotClassName,
                        )}
                      />
                    )}
                    <span className="truncate">{row.name}</span>
                  </button>
                )
              })}
              {overflow > 0 && (
                <span className="px-1.5 text-muted-foreground text-xs">
                  {t("broadcasts.calendar.more", { count: overflow })}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <BroadcastDetailDialog
        broadcast={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
        open={selected !== null}
      />
    </div>
  )
}
