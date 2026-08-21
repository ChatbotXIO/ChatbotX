"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useMemo } from "react"
import {
  buildCalendarGrid,
  buildYearOptions,
  isSameCalendarDay,
  withCalendarDay,
  withTime,
} from "@/features/get-user-data-webview/lib/calendar-grid"

type InlineDateTimePickerProps = {
  value: Date
  onChange: (value: Date) => void
  mode: "date" | "datetime"
  locale: string
  monthLabel: string
  yearLabel: string
}

const MONTH_INDEXES = Array.from({ length: 12 }, (_, index) => index)
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index)
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index)

const pad2 = (value: number) => String(value).padStart(2, "0")

const SELECT_CLASSES =
  "h-8 rounded-[3px] border border-input bg-background px-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary"

/**
 * Full-viewport inline month calendar (Sunday-first, Chatrace-style): nav
 * arrows pinned near the screen edges, native month/year selects centered,
 * hairline dividers between sections, a fixed 6x7 grid of flat full-width
 * day cells (the selection is a thin rectangular outline), and — in
 * datetime mode — native hour/minute selects. Native selects are
 * deliberate: they open the platform picker inside the Messenger webview,
 * where custom dropdowns are the flakiest surface.
 */
export function InlineDateTimePicker({
  value,
  onChange,
  mode,
  locale,
  monthLabel,
  yearLabel,
}: InlineDateTimePickerProps) {
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short" }),
    [locale],
  )
  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" })
    // Jan 4, 1970 was a Sunday; the following 7 days name the columns.
    return Array.from({ length: 7 }, (_, day) =>
      formatter.format(new Date(1970, 0, 4 + day)),
    )
  }, [locale])

  const year = value.getFullYear()
  const month = value.getMonth()
  const cells = useMemo(() => buildCalendarGrid(year, month), [year, month])
  const yearOptions = useMemo(
    () => buildYearOptions(new Date().getFullYear()),
    [],
  )

  const shiftMonth = (delta: number) => {
    const next = new Date(value)
    next.setDate(1)
    next.setMonth(month + delta)
    onChange(withCalendarDay(value, clampDayInto(next, value.getDate())))
  }

  const setYearMonth = (nextYear: number, nextMonth: number) => {
    const anchor = new Date(nextYear, nextMonth, 1)
    onChange(withCalendarDay(value, clampDayInto(anchor, value.getDate())))
  }

  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-10">
        <button
          aria-label={monthFormatter.format(new Date(year, month - 1, 1))}
          className="flex size-9 items-center justify-center text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => shiftMonth(-1)}
          type="button"
        >
          <ChevronLeftIcon className="size-5" />
        </button>

        <div className="flex items-center gap-2">
          <select
            aria-label={monthLabel}
            className={SELECT_CLASSES}
            onChange={(event) => setYearMonth(year, Number(event.target.value))}
            value={month}
          >
            {MONTH_INDEXES.map((index) => (
              <option key={index} value={index}>
                {monthFormatter.format(new Date(2024, index, 1))}
              </option>
            ))}
          </select>
          <select
            aria-label={yearLabel}
            className={SELECT_CLASSES}
            onChange={(event) =>
              setYearMonth(Number(event.target.value), month)
            }
            value={year}
          >
            {yearOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <button
          aria-label={monthFormatter.format(new Date(year, month + 1, 1))}
          className="flex size-9 items-center justify-center text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => shiftMonth(1)}
          type="button"
        >
          <ChevronRightIcon className="size-5" />
        </button>
      </div>

      {/* The 7-column grid is inline style, not a utility class: this public
          webview is opened from cached Messenger webviews and stale per-route
          CSS chunks must never be able to collapse the calendar layout. */}
      <div
        className="gap-y-1.5 border-b px-2 pt-4 pb-5 text-center sm:px-8"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        }}
      >
        {weekdayLabels.map((label) => (
          <div className="pb-2 text-muted-foreground/70 text-sm" key={label}>
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const isSelected = isSameCalendarDay(cell.date, value)
          return (
            <button
              aria-pressed={isSelected}
              className={cn(
                "mx-1 flex h-9 items-center justify-center rounded-[3px] border text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:mx-4",
                cell.inCurrentMonth
                  ? "text-foreground"
                  : "text-muted-foreground/50",
                isSelected
                  ? "border-primary font-semibold text-primary"
                  : "border-transparent hover:bg-primary/5",
              )}
              key={cell.date.toISOString()}
              onClick={() => onChange(withCalendarDay(value, cell.date))}
              type="button"
            >
              {cell.date.getDate()}
            </button>
          )
        })}
      </div>

      {mode === "datetime" ? (
        <div className="flex items-center justify-center gap-1.5 border-b py-4">
          <select
            aria-label="HH"
            className={cn(SELECT_CLASSES, "tabular-nums")}
            onChange={(event) =>
              onChange(
                withTime(value, Number(event.target.value), value.getMinutes()),
              )
            }
            value={value.getHours()}
          >
            {HOUR_OPTIONS.map((hour) => (
              <option key={hour} value={hour}>
                {pad2(hour)}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">:</span>
          <select
            aria-label="MM"
            className={cn(SELECT_CLASSES, "tabular-nums")}
            onChange={(event) =>
              onChange(
                withTime(value, value.getHours(), Number(event.target.value)),
              )
            }
            value={value.getMinutes()}
          >
            {MINUTE_OPTIONS.map((minute) => (
              <option key={minute} value={minute}>
                {pad2(minute)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  )
}

/** Keeps the picked day-of-month when jumping months of different lengths. */
function clampDayInto(monthAnchor: Date, day: number): Date {
  const lastDay = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth() + 1,
    0,
  ).getDate()
  return new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth(),
    Math.min(day, lastDay),
  )
}
