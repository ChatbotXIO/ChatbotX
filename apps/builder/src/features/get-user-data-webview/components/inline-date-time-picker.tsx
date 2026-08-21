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

/**
 * Full-page inline month calendar (Sunday-first, Chatrace-style): arrows on
 * the outer edges, native month/year selects centered, a fixed 6x7 day grid,
 * and — in datetime mode — native hour/minute selects. Native selects are
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
  const today = new Date()

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          aria-label={monthFormatter.format(new Date(year, month - 1, 1))}
          className="flex size-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => shiftMonth(-1)}
          type="button"
        >
          <ChevronLeftIcon className="size-5" />
        </button>

        <div className="flex items-center gap-2">
          <select
            aria-label={monthLabel}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
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
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
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
          className="flex size-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => shiftMonth(1)}
          type="button"
        >
          <ChevronRightIcon className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center">
        {weekdayLabels.map((label) => (
          <div
            className="pb-2 font-medium text-muted-foreground text-xs"
            key={label}
          >
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const isSelected = isSameCalendarDay(cell.date, value)
          const isToday = isSameCalendarDay(cell.date, today)
          return (
            <button
              aria-pressed={isSelected}
              className={cn(
                "mx-auto flex size-10 items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:size-11",
                cell.inCurrentMonth
                  ? "text-foreground"
                  : "text-muted-foreground/50",
                isSelected
                  ? "border border-primary font-semibold text-primary"
                  : "hover:bg-primary/10",
                isToday && !isSelected && "font-semibold text-primary",
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
        <div className="flex items-center justify-center gap-2 border-t pt-4">
          <select
            aria-label="HH"
            className="h-10 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-primary"
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
          <span className="font-semibold text-muted-foreground">:</span>
          <select
            aria-label="MM"
            className="h-10 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-primary"
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
