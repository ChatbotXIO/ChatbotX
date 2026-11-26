"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { isSameMonth } from "date-fns"
import { useFormatter } from "next-intl"
import { Fragment, type ReactNode, useMemo } from "react"
import {
  buildMonthGrid,
  buildWeekDays,
  dayKey,
  groupByDay,
  sortByDate,
  zonedDayKey,
} from "./calendar-grid"

const DEFAULT_MAX_ITEMS_PER_DAY = 3

export type CalendarGridView = "month" | "week"

/** What a day cell hands its renderer; `children` is the cell's content (day number, items, overflow). */
export type CalendarDayCell = {
  children: ReactNode
  className: string
  day: Date
  key: string
}

type CalendarGridProps<T> = {
  anchor: Date
  getDate: (item: T) => Date
  getKey: (item: T) => string
  items: T[]
  /** Overrides the cell element, e.g. to make it a drop target. Defaults to a plain `div`. */
  renderDayCell?: (cell: CalendarDayCell) => ReactNode
  renderItem: (item: T, options: { showTime: boolean }) => ReactNode
  renderOverflow: (hiddenCount: number) => ReactNode
  /** The zone the days are cut in and "today" is read in. */
  timezone: string
  view: CalendarGridView
}

const MONTH_CELL_CLASS = "flex min-h-28 flex-col gap-1 border-e border-b p-1.5"
const WEEK_CELL_CLASS =
  "flex h-96 flex-col gap-1 overflow-y-auto border-e border-b p-1.5"

/**
 * A month or week grid (weeks start on Monday) that places `items` on the day
 * they fall on in `timezone`. It owns layout only; what an item looks like, and
 * what a cell does besides holding items, comes from the caller.
 */
export function CalendarGrid<T>({
  anchor,
  getDate,
  getKey,
  items,
  renderDayCell,
  renderItem,
  renderOverflow,
  timezone,
  view,
}: CalendarGridProps<T>) {
  const formatter = useFormatter()
  const byDay = useMemo(
    () => groupByDay(items, getDate, timezone),
    [items, getDate, timezone],
  )
  const todayKey = zonedDayKey(new Date(), timezone)
  const weeks = view === "month" ? buildMonthGrid(anchor) : null
  const days = weeks ? weeks.flat() : buildWeekDays(anchor)
  const headerDays = weeks ? weeks[0] : days

  const renderCell = (day: Date): ReactNode => {
    const key = dayKey(day)
    const dayItems = byDay.get(key) ?? []
    const visible =
      view === "month"
        ? dayItems.slice(0, DEFAULT_MAX_ITEMS_PER_DAY)
        : sortByDate(dayItems, getDate)
    const overflow = dayItems.length - visible.length
    const className = cn(
      view === "month" ? MONTH_CELL_CLASS : WEEK_CELL_CLASS,
      view === "month" &&
        !isSameMonth(day, anchor) &&
        "bg-muted/40 text-muted-foreground",
    )
    const children = (
      <>
        <span
          className={cn(
            "self-end text-xs",
            key === todayKey &&
              "rounded-full bg-primary px-1.5 text-primary-foreground",
          )}
        >
          {day.getDate()}
        </span>
        {visible.map((item) => (
          <Fragment key={getKey(item)}>
            {renderItem(item, { showTime: view === "week" })}
          </Fragment>
        ))}
        {overflow > 0 && renderOverflow(overflow)}
      </>
    )
    if (renderDayCell) {
      return renderDayCell({ children, className, day, key })
    }
    return (
      <div className={className} key={key}>
        {children}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
      {headerDays.map((day) => (
        <div
          className="border-b bg-muted px-2 py-1.5 font-medium text-muted-foreground text-xs"
          key={`weekday-${dayKey(day)}`}
        >
          {formatter.dateTime(day, { weekday: "short" })}
        </div>
      ))}
      {days.map((day) => renderCell(day))}
    </div>
  )
}
