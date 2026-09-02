"use client"

import type { BroadcastCalendarRow } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Calendar } from "@chatbotx.io/ui/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@chatbotx.io/ui/components/ui/toggle-group"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { addYears, format, isSameMonth, isToday, subYears } from "date-fns"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { type ReactNode, useMemo, useState } from "react"
import { BroadcastDetailDialog } from "../broadcast-detail-dialog"
import {
  broadcastStatusConfig,
  parseBroadcastStatus,
} from "../lib/broadcast-status"
import {
  buildMonthGrid,
  buildWeekDays,
  CALENDAR_RANGES,
  type CalendarRange,
  calendarRangeConfig,
  DATE_PARAM_FORMAT,
  dayKey,
  groupByDay,
  parseDateParam,
  sortBySchedulesAt,
} from "../lib/calendar-grid"
import { broadcastsSearchParsers } from "../schema/search-parsers"

const MAX_CHIPS_PER_DAY = 3
const TIME_FORMAT_OPTIONS = { hour: "2-digit", minute: "2-digit" } as const

/** How far the jump picker's month/year navigation reaches from today — a future-scheduling calendar needs more forward reach than back reach. */
const JUMP_PICKER_PAST_YEARS = 2
const JUMP_PICKER_FUTURE_YEARS = 3

type Formatter = ReturnType<typeof useFormatter>

const isCalendarRange = (value: string | undefined): value is CalendarRange =>
  (CALENDAR_RANGES as readonly string[]).includes(value ?? "")

// Map-driven title formatting — one formatter per range, keyed by `range`
// itself, instead of an if/else chain.
const TITLE_FORMATTERS: Record<
  CalendarRange,
  (anchor: Date, formatter: Formatter) => string
> = {
  month: (anchor, formatter) =>
    formatter.dateTime(anchor, { month: "long", year: "numeric" }),
  week: (anchor, formatter) => {
    const { from, to } = calendarRangeConfig.week.getVisibleInterval(anchor)
    return formatter.dateTimeRange(from, to, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  },
  day: (anchor, formatter) =>
    formatter.dateTime(anchor, {
      day: "numeric",
      month: "long",
      weekday: "long",
      year: "numeric",
    }),
}

function StatusDot({ status }: { status: string }) {
  const parsedStatus = parseBroadcastStatus(status)
  if (!parsedStatus) {
    return null
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        broadcastStatusConfig[parsedStatus].dotClassName,
      )}
    />
  )
}

export function BroadcastsCalendar({
  range,
  date,
  broadcasts,
}: {
  range: CalendarRange
  date: string
  broadcasts: BroadcastCalendarRow[]
}) {
  const t = useTranslations()
  const formatter = useFormatter()
  const [, setQuery] = useQueryStates(
    {
      range: broadcastsSearchParsers.range,
      date: broadcastsSearchParsers.date,
    },
    { shallow: false, clearOnDefault: true },
  )
  const anchor = useMemo(() => parseDateParam(date), [date])
  const byDay = useMemo(() => groupByDay(broadcasts), [broadcasts])
  const [selected, setSelected] = useState<BroadcastCalendarRow | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)

  const goTo = (nextAnchor: Date | null) => {
    setQuery({
      date: nextAnchor ? format(nextAnchor, DATE_PARAM_FORMAT) : null,
    })
  }

  const title = useMemo(
    () => TITLE_FORMATTERS[range](anchor, formatter),
    [range, anchor, formatter],
  )

  // Computed once per render from `new Date()` (not `anchor`, which can
  // itself already be years away) so the jump picker's dropdown/navigation
  // bounds always reach a consistent window around *today*.
  const anchorToday = new Date()
  const jumpPickerStartMonth = subYears(anchorToday, JUMP_PICKER_PAST_YEARS)
  const jumpPickerEndMonth = addYears(anchorToday, JUMP_PICKER_FUTURE_YEARS)

  const renderChip = (row: BroadcastCalendarRow, showTime: boolean) => (
    <button
      className="flex items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-start text-xs hover:bg-accent"
      key={row.id}
      onClick={() => setSelected(row)}
      type="button"
    >
      <StatusDot status={row.status} />
      {showTime && (
        <span className="shrink-0 text-muted-foreground">
          {formatter.dateTime(row.schedulesAt, TIME_FORMAT_OPTIONS)}
        </span>
      )}
      <span className="truncate">{row.name}</span>
    </button>
  )

  const renderDayNumber = (day: Date) => (
    <span
      className={cn(
        "self-end text-xs",
        isToday(day) &&
          "rounded-full bg-primary px-1.5 text-primary-foreground",
      )}
    >
      {day.getDate()}
    </span>
  )

  const renderWeekdayHeader = (days: Date[]) => (
    <>
      {days.map((day) => (
        <div
          className="border-b bg-muted px-2 py-1.5 font-medium text-muted-foreground text-xs"
          key={`weekday-${dayKey(day)}`}
        >
          {formatter.dateTime(day, { weekday: "short" })}
        </div>
      ))}
    </>
  )

  // Map-driven bodies — one render function per range, keyed by `range`
  // itself. Add a new range's body here rather than an if/else chain.
  const bodies: Record<CalendarRange, () => ReactNode> = {
    month: () => {
      const weeks = buildMonthGrid(anchor)
      return (
        <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
          {renderWeekdayHeader(weeks[0])}
          {weeks.flat().map((day) => {
            const rows = byDay.get(dayKey(day)) ?? []
            const overflow = rows.length - MAX_CHIPS_PER_DAY
            return (
              <div
                className={cn(
                  "flex min-h-28 flex-col gap-1 border-e border-b p-1.5",
                  !isSameMonth(day, anchor) &&
                    "bg-muted/40 text-muted-foreground",
                )}
                key={dayKey(day)}
              >
                {renderDayNumber(day)}
                {rows
                  .slice(0, MAX_CHIPS_PER_DAY)
                  .map((row) => renderChip(row, false))}
                {overflow > 0 && (
                  <span className="px-1.5 text-muted-foreground text-xs">
                    {t("broadcasts.calendar.more", { count: overflow })}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )
    },
    week: () => {
      const days = buildWeekDays(anchor)
      return (
        <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
          {renderWeekdayHeader(days)}
          {days.map((day) => {
            const rows = sortBySchedulesAt(byDay.get(dayKey(day)) ?? [])
            return (
              <div
                className="flex h-96 flex-col gap-1 overflow-y-auto border-e border-b p-1.5"
                key={dayKey(day)}
              >
                {renderDayNumber(day)}
                {rows.map((row) => renderChip(row, true))}
              </div>
            )
          })}
        </div>
      )
    },
    day: () => {
      const rows = sortBySchedulesAt(byDay.get(dayKey(anchor)) ?? [])
      if (rows.length === 0) {
        return (
          <div className="flex flex-1 items-center justify-center rounded-lg border p-6 text-muted-foreground text-sm">
            {t("broadcasts.calendar.emptyDay")}
          </div>
        )
      }
      return (
        <div className="flex flex-col divide-y rounded-lg border">
          {rows.map((row) => (
            <button
              className="flex items-center gap-3 px-3 py-2 text-start text-sm hover:bg-accent"
              key={row.id}
              onClick={() => setSelected(row)}
              type="button"
            >
              <span className="w-14 shrink-0 text-muted-foreground text-xs">
                {formatter.dateTime(row.schedulesAt, TIME_FORMAT_OPTIONS)}
              </span>
              <StatusDot status={row.status} />
              <span className="truncate">{row.name}</span>
            </button>
          ))}
        </div>
      )
    },
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <Popover onOpenChange={setJumpOpen} open={jumpOpen}>
          <PopoverTrigger
            nativeButton={false}
            render={
              <button
                aria-haspopup="dialog"
                aria-label={t("broadcasts.calendar.jumpToDate")}
                className="rounded font-semibold text-lg hover:underline"
                type="button"
              >
                {title}
              </button>
            }
          />
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              captionLayout="dropdown"
              endMonth={jumpPickerEndMonth}
              mode="single"
              onSelect={(day) => {
                if (!day) {
                  return
                }
                setQuery({ date: format(day, DATE_PARAM_FORMAT) })
                setJumpOpen(false)
              }}
              selected={anchor}
              startMonth={jumpPickerStartMonth}
            />
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              aria-label={t("broadcasts.calendar.previous")}
              onClick={() => goTo(calendarRangeConfig[range].step(anchor, -1))}
              size="icon"
              variant="outline"
            >
              <ChevronLeftIcon />
            </Button>
            <Button onClick={() => goTo(null)} size="sm" variant="outline">
              {t("broadcasts.calendar.today")}
            </Button>
            <Button
              aria-label={t("broadcasts.calendar.next")}
              onClick={() => goTo(calendarRangeConfig[range].step(anchor, 1))}
              size="icon"
              variant="outline"
            >
              <ChevronRightIcon />
            </Button>
          </div>

          <ToggleGroup
            onValueChange={(vals) => {
              const next = vals[0]
              if (isCalendarRange(next) && next !== range) {
                setQuery({ range: next })
              }
            }}
            value={[range]}
            variant="outline"
          >
            {CALENDAR_RANGES.map((r) => (
              <ToggleGroupItem className="px-4" key={r} value={r}>
                {t(calendarRangeConfig[r].labelKey)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {bodies[range]()}

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
