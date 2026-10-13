import {
  RECURRENCE_MAX_INTERVAL,
  type RecurrenceFrequency,
  type RecurrenceRule,
} from "@chatbotx.io/utils/recurrence"
import { formatInTimeZone } from "date-fns-tz"

const LOCAL_DATE_PATTERN = "yyyy-MM-dd"

/** Today in `timezone`, as the `YYYY-MM-DD` the rule stores. */
export const todayIn = (timezone: string, now: Date): string =>
  formatInTimeZone(now, timezone, LOCAL_DATE_PATTERN)

/** Monday to Friday: the working week a repeating broadcast most often follows. */
const WORKING_WEEKDAYS = [1, 2, 3, 4, 5]
const DEFAULT_TIME_OF_DAY = "08:00"

/**
 * What a freshly chosen "Repeat" starts as: weekly, Monday to Friday at 08:00
 * in the user's timezone, starting today, never ending.
 */
export const buildDefaultRecurrenceRule = (
  timezone: string,
  now: Date,
): RecurrenceRule => ({
  frequency: "weekly",
  interval: 1,
  weekdays: [...WORKING_WEEKDAYS],
  timeOfDay: DEFAULT_TIME_OF_DAY,
  timezone,
  startsOn: todayIn(timezone, now),
  end: { kind: "never" },
})

/**
 * The fields a frequency does not use are cleared, so a stale hidden value can
 * never fail the schema; the ones it does use get a default from the start date.
 */
export const applyFrequency = (
  rule: RecurrenceRule,
  frequency: RecurrenceFrequency,
  rememberedWeekdays: number[] | undefined,
): RecurrenceRule => {
  const startDate = new Date(`${rule.startsOn}T00:00:00Z`)
  return {
    ...rule,
    frequency,
    interval: Math.min(rule.interval, RECURRENCE_MAX_INTERVAL[frequency]),
    weekdays:
      frequency === "weekly"
        ? (rememberedWeekdays ?? rule.weekdays ?? [...WORKING_WEEKDAYS])
        : undefined,
    monthDay:
      frequency === "monthly"
        ? (rule.monthDay ?? startDate.getUTCDate())
        : undefined,
  }
}
