import { formatInTimeZone } from "date-fns-tz"
import { z } from "zod"
import { isRealCalendarDate } from "./datetime"
import { isValidTimezone } from "./timezone"

/**
 * A feature- and channel-agnostic recurrence rule: "every N days / weeks /
 * months" at a wall-clock time in an IANA zone. Slots are computed with direct
 * period arithmetic — never by scanning day by day — so a series that started
 * years ago costs the same as a new one.
 */

export const recurrenceFrequencies = z.enum(["daily", "weekly", "monthly"])
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencies>

export const recurrenceEndKinds = z.enum([
  "never",
  "onDate",
  "afterOccurrences",
])

export const RECURRENCE_MONTH_DAY_LAST = "last"
export const RECURRENCE_MAX_OCCURRENCES = 10_000
/** Upper bound on skipped dates per rule; keeps the stored JSON and every skip lookup small. */
export const RECURRENCE_MAX_EXCLUDED_DATES = 366
/** Weeks start on Monday (ISO 8601); surfaced in API responses so SQL and UI agree. */
export const RECURRENCE_WEEK_STARTS_ON = "monday" as const

export const RECURRENCE_MAX_INTERVAL = {
  daily: 365,
  weekly: 52,
  monthly: 24,
} as const satisfies Record<RecurrenceFrequency, number>

/** Safety net for the period walk; reaching it is a bug, never a normal "series ended". */
const MAX_PERIOD_STEPS = 10_000

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000
const DAYS_PER_WEEK = 7
const LOCAL_DATE_PATTERN = "yyyy-MM-dd"
const LOCAL_DATE_TIME_PATTERN = "yyyy-MM-dd HH:mm"
const LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const localDateSchema = z.string().regex(LOCAL_DATE_REGEX)

/** Unrefined shape — use for RESPONSE schemas so a stored rule can never make a read fail. */
export const recurrenceRuleShape = z.object({
  frequency: recurrenceFrequencies,
  interval: z.number().int().min(1),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .optional()
    .describe("Weekly only. 0 = Sunday … 6 = Saturday."),
  monthDay: z
    .union([
      z.number().int().min(1).max(31),
      z.literal(RECURRENCE_MONTH_DAY_LAST),
    ])
    .optional()
    .describe(
      'Monthly only. Day 29–31 runs on the last day of shorter months; "last" always means the last day.',
    ),
  timeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .describe("24-hour wall-clock time, HH:mm, in `timezone`."),
  timezone: z.string().describe("IANA timezone name, e.g. Asia/Ho_Chi_Minh."),
  startsOn: localDateSchema.describe(
    "First eligible local date (YYYY-MM-DD) in `timezone`.",
  ),
  excludeDates: z
    .array(localDateSchema)
    .optional()
    .describe(
      `Local dates (YYYY-MM-DD, in \`timezone\`) that must not send. The series keeps running and the skipped run is recorded as skipped. At most ${RECURRENCE_MAX_EXCLUDED_DATES}.`,
    ),
  end: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal(recurrenceEndKinds.enum.never) }),
    z.object({
      kind: z.literal(recurrenceEndKinds.enum.onDate),
      date: localDateSchema,
    }),
    z.object({
      kind: z.literal(recurrenceEndKinds.enum.afterOccurrences),
      count: z.number().int().min(1).max(RECURRENCE_MAX_OCCURRENCES),
    }),
  ]),
})
export type RecurrenceRule = z.infer<typeof recurrenceRuleShape>

/** Refined INPUT schema: every issue is attached to the field it concerns. */
export const recurrenceRuleSchema = recurrenceRuleShape.superRefine(
  (rule, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message })

    if (rule.interval > RECURRENCE_MAX_INTERVAL[rule.frequency]) {
      issue(
        ["interval"],
        `Interval must be at most ${RECURRENCE_MAX_INTERVAL[rule.frequency]} for ${rule.frequency} schedules.`,
      )
    }
    if (rule.frequency === "weekly" && !rule.weekdays?.length) {
      issue(["weekdays"], "Pick at least one weekday for a weekly schedule.")
    }
    if (rule.frequency === "monthly" && rule.monthDay === undefined) {
      issue(["monthDay"], "Pick the day of the month for a monthly schedule.")
    }
    if (!isValidTimezone(rule.timezone)) {
      issue(["timezone"], "Unknown IANA timezone.")
    }
    if (!isRealCalendarDate(rule.startsOn)) {
      issue(["startsOn"], "Not a real calendar date.")
    }
    if ((rule.excludeDates?.length ?? 0) > RECURRENCE_MAX_EXCLUDED_DATES) {
      issue(
        ["excludeDates"],
        `Skip at most ${RECURRENCE_MAX_EXCLUDED_DATES} dates.`,
      )
    }
    rule.excludeDates?.forEach((date, index) => {
      if (!isRealCalendarDate(date)) {
        issue(["excludeDates", index], "Not a real calendar date.")
      }
    })
    if (rule.end.kind === recurrenceEndKinds.enum.onDate) {
      if (!isRealCalendarDate(rule.end.date)) {
        issue(["end", "date"], "Not a real calendar date.")
      } else if (rule.end.date < rule.startsOn) {
        issue(["end", "date"], "The end date cannot be before the start date.")
      }
    }
  },
)

// ---------------------------------------------------------------------------
// Local-date arithmetic. A local date is "YYYY-MM-DD"; a day number is whole
// days since the Unix epoch, computed in UTC so no process timezone leaks in.
// ---------------------------------------------------------------------------

const toDayNumber = (localDate: string): number => {
  const [year, month, day] = localDate.split("-").map(Number)
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

const fromDayNumber = (dayNumber: number): string =>
  new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10)

const weekdayOfDayNumber = (dayNumber: number): number =>
  new Date(dayNumber * MS_PER_DAY).getUTCDay()

/** Day number of the Monday that starts the ISO week containing `dayNumber`. */
const isoWeekStart = (dayNumber: number): number =>
  dayNumber - ((weekdayOfDayNumber(dayNumber) + 6) % DAYS_PER_WEEK)

const monthIndexOf = (localDate: string): number => {
  const [year, month] = localDate.split("-").map(Number)
  return year * 12 + (month - 1)
}

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate()

const MIN_PERIOD = 0

/** Index of the schedule period (day / ISO week / month, stepped by `interval`) holding `localDate`. */
const periodIndexOf = (rule: RecurrenceRule, localDate: string): number => {
  const startsOn = rule.startsOn
  const steps = {
    daily: () => toDayNumber(localDate) - toDayNumber(startsOn),
    weekly: () =>
      (isoWeekStart(toDayNumber(localDate)) -
        isoWeekStart(toDayNumber(startsOn))) /
      DAYS_PER_WEEK,
    monthly: () => monthIndexOf(localDate) - monthIndexOf(startsOn),
  } satisfies Record<RecurrenceFrequency, () => number>
  return Math.max(
    MIN_PERIOD,
    Math.floor(steps[rule.frequency]() / rule.interval),
  )
}

/** Eligible local dates of period `index`, ascending, never before `startsOn`. */
const datesOfPeriod = (rule: RecurrenceRule, index: number): string[] => {
  const startDay = toDayNumber(rule.startsOn)
  const offset = index * rule.interval

  const byFrequency = {
    daily: () => [startDay + offset],
    weekly: () => {
      const weekStart = isoWeekStart(startDay) + offset * DAYS_PER_WEEK
      return [...new Set(rule.weekdays ?? [])]
        .map((weekday) => weekStart + ((weekday + 6) % DAYS_PER_WEEK))
        .sort((a, b) => a - b)
    },
    monthly: () => {
      const monthIndex = monthIndexOf(rule.startsOn) + offset
      const year = Math.floor(monthIndex / 12)
      const month = (monthIndex % 12) + 1
      const lastDay = daysInMonth(year, month)
      const monthDay = rule.monthDay ?? RECURRENCE_MONTH_DAY_LAST
      const day =
        monthDay === RECURRENCE_MONTH_DAY_LAST
          ? lastDay
          : Math.min(monthDay, lastDay)
      return [Date.UTC(year, month - 1, day) / MS_PER_DAY]
    },
  } satisfies Record<RecurrenceFrequency, () => number[]>

  return byFrequency[rule.frequency]()
    .filter((dayNumber) => dayNumber >= startDay)
    .map(fromDayNumber)
}

const lastEligibleDate = (rule: RecurrenceRule): string | null =>
  rule.end.kind === recurrenceEndKinds.enum.onDate ? rule.end.date : null

const isExhaustedByCount = (
  rule: RecurrenceRule,
  occurrenceCount: number,
): boolean =>
  rule.end.kind === recurrenceEndKinds.enum.afterOccurrences &&
  occurrenceCount >= rule.end.count

// ---------------------------------------------------------------------------
// Wall clock → instant, with an explicit DST policy.
// ---------------------------------------------------------------------------

/**
 * The zone's UTC offset (ms, east positive) at an instant, read from real
 * `Intl` formatting. `date-fns-tz`'s `getTimezoneOffset` reports the wrong
 * offset on the transition instant itself, so it cannot be used to verify a
 * candidate there.
 */
const offsetAt = (instantMs: number, timezone: string): number => {
  const minuteMs = Math.floor(instantMs / MS_PER_MINUTE) * MS_PER_MINUTE
  const wallClock = formatInTimeZone(
    new Date(minuteMs),
    timezone,
    "yyyy-MM-dd'T'HH:mm",
  )
  return Date.parse(`${wallClock}:00Z`) - minuteMs
}

/**
 * Resolves a local date + `HH:mm` in an IANA zone to a UTC instant.
 *
 * - Ambiguous local time (clocks go back): the EARLIER instant.
 * - Nonexistent local time (clocks go forward, including a skipped whole day):
 *   shifted FORWARD by the real size of the gap.
 *
 * `date-fns-tz`'s own `fromZonedTime` picks neither policy reliably (it maps
 * the New York gap backwards and a skipped Apia day onto the day before), so
 * the instant is derived from the zone's UTC offsets directly.
 */
export const resolveZonedInstant = (
  localDate: string,
  timeOfDay: string,
  timezone: string,
): Date => {
  const [hours, minutes] = timeOfDay.split(":").map(Number)
  const [year, month, day] = localDate.split("-").map(Number)
  // The wall clock read as if it were UTC; real instants sit within ±14h of it.
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hours, minutes)

  const offsetBefore = offsetAt(wallClockAsUtc - MS_PER_DAY, timezone)
  const offsetAfter = offsetAt(wallClockAsUtc + MS_PER_DAY, timezone)

  const validInstants = [offsetBefore, offsetAfter]
    .map((offset) => ({ offset, instant: wallClockAsUtc - offset }))
    .filter(({ offset, instant }) => offsetAt(instant, timezone) === offset)
    .map(({ instant }) => instant)

  if (validInstants.length > 0) {
    return new Date(Math.min(...validInstants))
  }
  return new Date(wallClockAsUtc - offsetBefore)
}

/** `YYYY-MM-DD` of an instant in `timezone`. */
export const localDateOf = (instant: Date, timezone: string): string =>
  formatInTimeZone(instant, timezone, LOCAL_DATE_PATTERN)

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** First slot strictly after `after`, or `null` once the series is genuinely over. */
export const computeNextOccurrence = (
  rule: RecurrenceRule,
  input: { after: Date; occurrenceCount: number },
): Date | null => {
  if (isExhaustedByCount(rule, input.occurrenceCount)) {
    return null
  }
  const endDate = lastEligibleDate(rule)
  // One period back: a forward DST shift can push a slot onto the next date.
  let period = Math.max(
    MIN_PERIOD,
    periodIndexOf(rule, localDateOf(input.after, rule.timezone)) - 1,
  )

  for (let step = 0; step < MAX_PERIOD_STEPS; step += 1, period += 1) {
    const dates = datesOfPeriod(rule, period)
    for (const date of dates) {
      if (endDate && date > endDate) {
        return null
      }
      const instant = resolveZonedInstant(date, rule.timeOfDay, rule.timezone)
      if (instant > input.after) {
        return instant
      }
    }
  }
  throw new Error("Recurrence search exceeded its step limit")
}

/** Latest slot at or before `atOrBefore` — the one catch-up sends after an outage. */
export const computeLatestOccurrence = (
  rule: RecurrenceRule,
  input: { atOrBefore: Date; occurrenceCount: number },
): Date | null => {
  if (isExhaustedByCount(rule, input.occurrenceCount)) {
    return null
  }
  const endDate = lastEligibleDate(rule)
  const atOrBeforeDate = localDateOf(input.atOrBefore, rule.timezone)
  // Start no later than the end date, so a long-finished series is O(1) too.
  const anchorDate =
    endDate && endDate < atOrBeforeDate ? endDate : atOrBeforeDate
  let period = periodIndexOf(rule, anchorDate) + 1

  for (
    let step = 0;
    step < MAX_PERIOD_STEPS && period >= MIN_PERIOD;
    step += 1, period -= 1
  ) {
    for (const date of datesOfPeriod(rule, period).reverse()) {
      if (endDate && date > endDate) {
        continue
      }
      const instant = resolveZonedInstant(date, rule.timeOfDay, rule.timezone)
      if (instant <= input.atOrBefore) {
        return instant
      }
    }
  }
  if (period >= MIN_PERIOD) {
    throw new Error("Recurrence search exceeded its step limit")
  }
  return null
}

/** One scheduled slot, flagged when its local date is in `excludeDates`. */
export type UpcomingSlot = { at: Date; date: string; excluded: boolean }

/**
 * Whether the rule skips the slot at `instant`. Matches the slot's resolved
 * local date, the same date the ledger's `localSlot` shows.
 */
export const isExcludedSlot = (rule: RecurrenceRule, instant: Date): boolean =>
  rule.excludeDates?.includes(localDateOf(instant, rule.timezone)) ?? false

/**
 * The slot that falls on a local date, or `null` when the rule has none there
 * (wrong weekday, outside the start/end window, count exhausted).
 */
export const findSlotOnDate = (
  rule: RecurrenceRule,
  input: { date: string; occurrenceCount: number },
): Date | null => {
  const dayStart = resolveZonedInstant(input.date, "00:00", rule.timezone)
  const next = computeNextOccurrence(rule, {
    after: new Date(dayStart.getTime() - 1),
    occurrenceCount: input.occurrenceCount,
  })
  return next && localDateOf(next, rule.timezone) === input.date ? next : null
}

/**
 * First slot at or after `from` that is not skipped. Skipped slots never
 * consume `afterOccurrences`, so the count stays fixed while walking past them.
 */
export const computeNextSendable = (
  rule: RecurrenceRule,
  input: { from: Date; occurrenceCount: number },
): Date | null => {
  const maxSkips = rule.excludeDates?.length ?? 0
  let slot: Date | null = input.from
  for (let skipped = 0; slot && skipped <= maxSkips; skipped += 1) {
    if (!isExcludedSlot(rule, slot)) {
      return slot
    }
    slot = computeNextOccurrence(rule, {
      after: slot,
      occurrenceCount: input.occurrenceCount,
    })
  }
  return null
}

const collectUpcomingSlots = (
  rule: RecurrenceRule,
  input: { after: Date; occurrenceCount: number; limit: number },
  includeExcluded: boolean,
): UpcomingSlot[] => {
  const slots: UpcomingSlot[] = []
  let after = input.after
  let occurrenceCount = input.occurrenceCount
  // Each skipped date matches at most one slot, so this bound is never the limiter.
  const maxSteps = input.limit + (rule.excludeDates?.length ?? 0)

  for (let step = 0; step < maxSteps && slots.length < input.limit; step += 1) {
    const at = computeNextOccurrence(rule, { after, occurrenceCount })
    if (!at) {
      break
    }
    after = at
    const excluded = isExcludedSlot(rule, at)
    if (!excluded) {
      // Matches the persisted count: only runs that are sent consume `afterOccurrences`.
      occurrenceCount += 1
    }
    if (includeExcluded || !excluded) {
      slots.push({ at, date: localDateOf(at, rule.timezone), excluded })
    }
  }
  return slots
}

/** The next `limit` slots after `after`, skipped ones included and flagged. */
export const listUpcomingSlots = (
  rule: RecurrenceRule,
  input: { after: Date; occurrenceCount: number; limit: number },
): UpcomingSlot[] => collectUpcomingSlots(rule, input, true)

/** The next `limit` runs that will send — shared by the form preview and the public preview. */
export const listUpcomingOccurrences = (
  rule: RecurrenceRule,
  input: { after: Date; occurrenceCount: number; limit: number },
): Date[] => collectUpcomingSlots(rule, input, false).map((slot) => slot.at)

/** Slots in `(after, through]`, oldest first, at most `limit` — what an outage or a pause skipped. */
export const listOccurrencesBetween = (
  rule: RecurrenceRule,
  input: {
    after: Date
    through: Date
    occurrenceCount: number
    limit: number
  },
): Date[] => {
  const slots: Date[] = []
  let after = input.after

  while (slots.length < input.limit) {
    const next = computeNextOccurrence(rule, {
      after,
      occurrenceCount: input.occurrenceCount,
    })
    if (!next || next > input.through) {
      break
    }
    slots.push(next)
    after = next
  }
  return slots
}

/** `YYYY-MM-DD HH:mm` of an instant in the rule's zone — the ledger's logical slot id. */
export const toLocalSlot = (instant: Date, timezone: string): string =>
  formatInTimeZone(instant, timezone, LOCAL_DATE_TIME_PATTERN)
