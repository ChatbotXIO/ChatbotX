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
import {
  addYears,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  subYears,
} from "date-fns"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { type ReactNode, useMemo, useRef, useState } from "react"
import type { DateRange } from "react-day-picker"
import { BroadcastDetailDialog } from "../broadcast-detail-dialog"
import {
  broadcastStatusConfig,
  parseBroadcastStatus,
} from "../lib/broadcast-status"
import {
  buildMonthGrid,
  buildRangeDays,
  buildWeekDays,
  CALENDAR_RANGES,
  type CalendarRange,
  calendarRangeConfig,
  DATE_PARAM_FORMAT,
  dayKey,
  groupByDay,
  parseDateParam,
  parseEndDateParam,
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
// itself, instead of an if/else chain. `endAnchor` is only meaningful for
// "custom"; the other ranges ignore it.
const TITLE_FORMATTERS: Record<
  CalendarRange,
  (anchor: Date, formatter: Formatter, endAnchor: Date) => string
> = {
  month: (anchor, formatter) =>
    formatter.dateTime(anchor, { month: "long", year: "numeric" }),
  week: (anchor, formatter) => {
    const { from, to } = calendarRangeConfig.week.getVisibleInterval(
      anchor,
      anchor,
    )
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
  custom: (anchor, formatter, endAnchor) =>
    formatter.dateTimeRange(anchor, endAnchor, {
      day: "numeric",
      month: "short",
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

// Map-driven toggle behaviour — keeps the ToggleGroup handler free of an
// if/else chain. "write" ranges commit immediately on click (existing
// behaviour: write `range` and clear any stray `endDate`). "custom" is
// deferred: clicking it never writes the URL — it only opens the range
// picker (see the item's own `onClick` below); the URL only changes when
// the user clicks Apply inside that picker, at which point the picker's
// shared `applyRangeSelection` writes `range: "custom"` itself.
const TOGGLE_ACTIONS: Record<CalendarRange, "write" | "openPicker"> = {
  month: "write",
  week: "write",
  day: "write",
  custom: "openPicker",
}

// Scoped to the two-month range picker only (via the Calendar `classNames`
// prop) rather than widening the shared ui wrapper for every consumer —
// zero blast radius. `month` gets a floor width so a 2-up row never
// squeezes a month below its caption's natural width; `dropdown_root`
// inherits `whitespace-nowrap` down to the caption label it wraps so the
// month/year text never breaks onto a second line. Both strings replicate
// the wrapper's current defaults for these keys (a `classNames` override
// replaces, not merges, per key) plus the added utility.
const RANGE_PICKER_CLASS_NAMES = {
  month: "flex flex-col w-full min-w-64 gap-4",
  dropdown_root:
    "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md whitespace-nowrap",
}

export function BroadcastsCalendar({
  range,
  date,
  endDate,
  broadcasts,
}: {
  range: CalendarRange
  date: string
  endDate: string
  broadcasts: BroadcastCalendarRow[]
}) {
  const t = useTranslations()
  const formatter = useFormatter()
  const [, setQuery] = useQueryStates(
    {
      range: broadcastsSearchParsers.range,
      date: broadcastsSearchParsers.date,
      endDate: broadcastsSearchParsers.endDate,
    },
    { shallow: false, clearOnDefault: true },
  )
  const anchor = useMemo(() => parseDateParam(date), [date])
  const endAnchor = useMemo(
    () => parseEndDateParam(endDate, anchor),
    [endDate, anchor],
  )
  const byDay = useMemo(() => groupByDay(broadcasts), [broadcasts])
  const [selected, setSelected] = useState<BroadcastCalendarRow | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [customPopoverOpen, setCustomPopoverOpen] = useState(false)
  const customToggleRef = useRef<HTMLButtonElement>(null)
  // In-progress range-mode selection (real react-day-picker 9.14 needs local
  // pending state: a fully-controlled `selected` that's always a complete
  // range makes every click "reset" — resetOnSelect alone doesn't fix that,
  // see the shared onSelect handler below).
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>()

  // Computed once per render from `new Date()` (not `anchor`, which can
  // itself already be years away) so the jump picker's dropdown/navigation
  // bounds always reach a consistent window around *today*.
  const today = new Date()
  const jumpPickerStartMonth = subYears(today, JUMP_PICKER_PAST_YEARS)
  const jumpPickerEndMonth = addYears(today, JUMP_PICKER_FUTURE_YEARS)

  // Day clicks only ever update the local pending selection — no URL write,
  // no close. Committing is an explicit user action (the Apply button
  // below), not an automatic side effect of completing a from→to pick.
  const handleRangeSelect = (nextRange: DateRange | undefined) => {
    setPendingRange(nextRange)
  }

  // Apply-button handler — shared by both popovers (the title popover in
  // custom mode, and the popover anchored under the Custom toggle). Clamps
  // the pending range exactly like the day grid's own bounds, then writes
  // `range`, `date`, and `endDate` in a single `setQuery` call: this is the
  // only place the URL ever switches into "custom" — clicking the Custom
  // toggle itself never writes (see `TOGGLE_ACTIONS`). Including
  // `range: "custom"` even when already on "custom" (the title-popover
  // path) is harmless, same value. Explicitly clears `pendingRange` on the
  // commit path too (not just on dismiss) so a stale, possibly-unclamped
  // pending selection can never survive a commit.
  const applyRangeSelection = (close: () => void) => {
    if (!(pendingRange?.from && pendingRange?.to)) {
      return
    }
    const clampedTo = parseEndDateParam(
      format(pendingRange.to, DATE_PARAM_FORMAT),
      startOfDay(pendingRange.from),
    )
    setQuery({
      range: "custom",
      date: format(pendingRange.from, DATE_PARAM_FORMAT),
      endDate: format(clampedTo, DATE_PARAM_FORMAT),
    })
    setPendingRange(undefined)
    close()
  }

  // Shared by both the title popover (custom mode) and the popover anchored
  // under the Custom toggle — one picker, no duplicated range logic. Both
  // get the Apply footer since both can commit a range.
  const renderRangePicker = (close: () => void) => (
    <div className="flex flex-col gap-2">
      <Calendar
        captionLayout="dropdown"
        classNames={RANGE_PICKER_CLASS_NAMES}
        endMonth={jumpPickerEndMonth}
        mode="range"
        numberOfMonths={2}
        onSelect={handleRangeSelect}
        resetOnSelect
        // Standard multi-month range-picker behavior: outside days at a
        // month boundary would otherwise duplicate part of the range
        // highlight in the adjacent month's trailing/leading cells. Scoped
        // to this picker only — the wrapper default (and the single-mode
        // jump picker below) keep showing outside days.
        selected={pendingRange ?? { from: anchor, to: endAnchor }}
        showOutsideDays={false}
        startMonth={jumpPickerStartMonth}
      />
      <div className="flex justify-end px-3 pb-3">
        <Button
          disabled={!(pendingRange?.from && pendingRange?.to)}
          onClick={() => applyRangeSelection(close)}
          size="sm"
        >
          {t("broadcasts.calendar.apply")}
        </Button>
      </div>
    </div>
  )

  const goTo = (next: { date: Date; endDate: Date | null } | null) => {
    setQuery({
      date: next ? format(next.date, DATE_PARAM_FORMAT) : null,
      endDate:
        next?.endDate == null ? null : format(next.endDate, DATE_PARAM_FORMAT),
    })
  }

  const title = useMemo(
    () => TITLE_FORMATTERS[range](anchor, formatter, endAnchor),
    [range, anchor, endAnchor, formatter],
  )

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

  // Shared by the day and custom-range bodies' agenda-list rows — both
  // render the same time/status/name button, just for a different set of
  // days.
  const renderAgendaRow = (row: BroadcastCalendarRow) => (
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
          {rows.map((row) => renderAgendaRow(row))}
        </div>
      )
    },
    custom: () => {
      const days = buildRangeDays(anchor, endAnchor).filter(
        (day) => (byDay.get(dayKey(day)) ?? []).length > 0,
      )
      if (days.length === 0) {
        return (
          <div className="flex flex-1 items-center justify-center rounded-lg border p-6 text-muted-foreground text-sm">
            {t("broadcasts.calendar.emptyRange")}
          </div>
        )
      }
      return (
        <div className="flex flex-col gap-4">
          {days.map((day) => {
            const rows = sortBySchedulesAt(byDay.get(dayKey(day)) ?? [])
            return (
              <div className="flex flex-col gap-1.5" key={dayKey(day)}>
                <div
                  className={cn(
                    "w-fit px-1.5 py-0.5 font-medium text-sm",
                    isToday(day) &&
                      "rounded-full bg-primary text-primary-foreground",
                  )}
                >
                  {formatter.dateTime(day, {
                    day: "numeric",
                    month: "short",
                    weekday: "short",
                  })}
                </div>
                <div className="flex flex-col divide-y rounded-lg border">
                  {rows.map((row) => renderAgendaRow(row))}
                </div>
              </div>
            )
          })}
        </div>
      )
    },
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <Popover
          onOpenChange={(open) => {
            setJumpOpen(open)
            if (!open) {
              setPendingRange(undefined)
            }
          }}
          open={jumpOpen}
        >
          <PopoverTrigger
            nativeButton={false}
            render={
              <button
                aria-haspopup="dialog"
                aria-label={t("broadcasts.calendar.jumpToDate")}
                className="rounded font-semibold text-lg underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-ring"
                type="button"
              >
                {title}
              </button>
            }
          />
          <PopoverContent align="start" className="w-auto p-0">
            {range === "custom" ? (
              renderRangePicker(() => setJumpOpen(false))
            ) : (
              <Calendar
                captionLayout="dropdown"
                endMonth={jumpPickerEndMonth}
                mode="single"
                onSelect={(day) => {
                  if (!day) {
                    return
                  }
                  setQuery({
                    date: format(day, DATE_PARAM_FORMAT),
                    endDate: null,
                  })
                  setJumpOpen(false)
                }}
                selected={anchor}
                startMonth={jumpPickerStartMonth}
              />
            )}
          </PopoverContent>
        </Popover>

        <ToggleGroup
          onValueChange={(vals) => {
            const next = vals[0]
            if (!(isCalendarRange(next) && next !== range)) {
              return
            }
            // "custom" never reaches here with a write — TOGGLE_ACTIONS
            // routes it to "openPicker", handled entirely by the item's own
            // onClick below. Only Apply (inside the picker) ever writes
            // range: "custom".
            if (TOGGLE_ACTIONS[next] === "write") {
              setQuery({ range: next, endDate: null })
              // Programmatic close bypasses the Popover's onOpenChange, so
              // clear the pending pick here too — otherwise a later reopen
              // would show the stale range with Apply already enabled.
              setCustomPopoverOpen(false)
              setPendingRange(undefined)
            }
          }}
          value={[range]}
          variant="outline"
        >
          {CALENDAR_RANGES.map((r) =>
            r === "custom" ? (
              <Popover
                key={r}
                onOpenChange={(open) => {
                  setCustomPopoverOpen(open)
                  if (!open) {
                    setPendingRange(undefined)
                  }
                }}
                open={customPopoverOpen}
              >
                <ToggleGroupItem
                  className="px-4"
                  onClick={() => setCustomPopoverOpen(true)}
                  ref={customToggleRef}
                  value={r}
                >
                  {t(calendarRangeConfig[r].labelKey)}
                </ToggleGroupItem>
                <PopoverContent
                  align="start"
                  anchor={customToggleRef}
                  className="w-auto p-0"
                >
                  {renderRangePicker(() => setCustomPopoverOpen(false))}
                </PopoverContent>
              </Popover>
            ) : (
              <ToggleGroupItem className="px-4" key={r} value={r}>
                {t(calendarRangeConfig[r].labelKey)}
              </ToggleGroupItem>
            ),
          )}
        </ToggleGroup>
      </div>

      {bodies[range]()}

      {/* Bottom-center navigation, pagination-style. */}
      <div className="flex items-center justify-center gap-1">
        <Button
          aria-label={t("broadcasts.calendar.previous")}
          onClick={() =>
            goTo(calendarRangeConfig[range].step(anchor, endAnchor, -1))
          }
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
          onClick={() =>
            goTo(calendarRangeConfig[range].step(anchor, endAnchor, 1))
          }
          size="icon"
          variant="outline"
        >
          <ChevronRightIcon />
        </Button>
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
