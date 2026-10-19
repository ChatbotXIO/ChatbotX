import {
  WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY,
  WORKING_HOURS_MINUTES_PER_DAY,
  type WorkingHoursDateRanges,
} from "@chatbotx.io/database/partials"
import { formatMinute, TIME_STEP_MINUTES } from "./time-options"

export type DateOverrideDraft = {
  /** `YYYY-MM-DD` in the workspace timezone; empty until picked. */
  date: string
  name: string
  closed: boolean
  ranges: WorkingHoursDateRanges
}

/** The editable draft of a saved override or holiday row. */
export const toDateOverrideDraft = (row: {
  date: string
  name?: string | null
  ranges: WorkingHoursDateRanges
}): DateOverrideDraft => ({
  date: row.date,
  name: row.name ?? "",
  closed: row.ranges.length === 0,
  ranges: row.ranges,
})

export type DateRangesError = "order" | "overlap"

const DEFAULT_START_MINUTE = 9 * 60
const DEFAULT_END_MINUTE = 17 * 60
const ADDED_RANGE_MINUTES = 60
const LAST_START_MINUTE = WORKING_HOURS_MINUTES_PER_DAY - TIME_STEP_MINUTES

export const emptyDraft = (): DateOverrideDraft => ({
  date: "",
  name: "",
  closed: true,
  ranges: [],
})

/** Turning "closed" off seeds 09:00-17:00; turning it on drops the ranges. */
export function setClosed(
  draft: DateOverrideDraft,
  closed: boolean,
): DateOverrideDraft {
  if (closed) {
    return { ...draft, closed: true, ranges: [] }
  }
  return {
    ...draft,
    closed: false,
    ranges:
      draft.ranges.length > 0
        ? draft.ranges
        : [
            {
              startMinute: DEFAULT_START_MINUTE,
              endMinute: DEFAULT_END_MINUTE,
            },
          ],
  }
}

export function canAddRange(ranges: WorkingHoursDateRanges): boolean {
  if (ranges.length >= WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY) {
    return false
  }
  const lastEnd = Math.max(0, ...ranges.map((range) => range.endMinute))
  return ranges.length === 0 || lastEnd <= LAST_START_MINUTE
}

export function addRange(
  ranges: WorkingHoursDateRanges,
): WorkingHoursDateRanges {
  const start = Math.max(0, ...ranges.map((range) => range.endMinute))
  return [
    ...ranges,
    {
      startMinute: start,
      endMinute: Math.min(
        start + ADDED_RANGE_MINUTES,
        WORKING_HOURS_MINUTES_PER_DAY,
      ),
    },
  ]
}

export function validateRanges(
  ranges: WorkingHoursDateRanges,
): DateRangesError | undefined {
  if (ranges.some((range) => range.startMinute >= range.endMinute)) {
    return "order"
  }
  const sorted = [...ranges].sort((a, b) => a.startMinute - b.startMinute)
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index].startMinute < sorted[index - 1].endMinute) {
      return "overlap"
    }
  }
}

/** `09:00–12:00, 13:00–17:00`; empty for a closed day. */
export function formatRanges(
  ranges: readonly { startMinute: number; endMinute: number }[],
): string {
  return [...ranges]
    .sort((a, b) => a.startMinute - b.startMinute)
    .map(
      (range) =>
        `${formatMinute(range.startMinute)}–${formatMinute(range.endMinute)}`,
    )
    .join(", ")
}

export const sortByDate = <T extends { date: string }>(
  rows: readonly T[],
): T[] => [...rows].sort((a, b) => a.date.localeCompare(b.date))
