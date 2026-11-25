import {
  type CalendarRange,
  getBrowserTimeZone,
  groupByDay as groupByDayInZone,
  calendarRangeConfig as sharedRangeConfig,
  sortByDate,
} from "@/components/calendar/calendar-grid"

// The grid maths lives in the shared calendar module (@/components/calendar/calendar-grid);
// broadcasts only add their i18n labels and the "rows carry `schedulesAt`" convention.

type BroadcastRangeConfigEntry = (typeof sharedRangeConfig)[CalendarRange] & {
  labelKey: `broadcasts.calendar.ranges.${CalendarRange}`
}

export const calendarRangeConfig: Record<
  CalendarRange,
  BroadcastRangeConfigEntry
> = {
  month: {
    ...sharedRangeConfig.month,
    labelKey: "broadcasts.calendar.ranges.month",
  },
  week: {
    ...sharedRangeConfig.week,
    labelKey: "broadcasts.calendar.ranges.week",
  },
  day: { ...sharedRangeConfig.day, labelKey: "broadcasts.calendar.ranges.day" },
  custom: {
    ...sharedRangeConfig.custom,
    labelKey: "broadcasts.calendar.ranges.custom",
  },
}

export function groupByDay<T extends { schedulesAt: Date }>(
  rows: T[],
): Map<string, T[]> {
  return groupByDayInZone(rows, (row) => row.schedulesAt, getBrowserTimeZone())
}

export function sortBySchedulesAt<T extends { schedulesAt: Date }>(
  rows: T[],
): T[] {
  return sortByDate(rows, (row) => row.schedulesAt)
}
