import { WORKING_HOURS_MINUTES_PER_DAY } from "@chatbotx.io/database/partials"

/** Granularity of the schedule editor (plan decision Q7). */
export const TIME_STEP_MINUTES = 15
const MINUTES_PER_HOUR = 60

function range(from: number, to: number): number[] {
  const values: number[] = []
  for (let minute = from; minute <= to; minute += TIME_STEP_MINUTES) {
    values.push(minute)
  }
  return values
}

/** 00:00 ... 23:45 */
export const START_MINUTE_OPTIONS: readonly number[] = range(
  0,
  WORKING_HOURS_MINUTES_PER_DAY - TIME_STEP_MINUTES,
)

/** 00:15 ... 24:00 (`24:00` is minute 1440, end-exclusive end of the day) */
export const END_MINUTE_OPTIONS: readonly number[] = range(
  TIME_STEP_MINUTES,
  WORKING_HOURS_MINUTES_PER_DAY,
)

const pad = (value: number) => String(value).padStart(2, "0")

/** Minutes since local midnight -> `HH:mm`; 1440 renders as `24:00`. */
export function formatMinute(minute: number): string {
  const clamped = Math.min(Math.max(minute, 0), WORKING_HOURS_MINUTES_PER_DAY)
  return `${pad(Math.floor(clamped / MINUTES_PER_HOUR))}:${pad(clamped % MINUTES_PER_HOUR)}`
}

export type MinuteSelectItem = { label: string; value: string }

function toMinuteSelectItems(minutes: readonly number[]): MinuteSelectItem[] {
  return minutes.map((minute) => ({
    label: formatMinute(minute),
    value: String(minute),
  }))
}

export const START_SELECT_ITEMS = toMinuteSelectItems(START_MINUTE_OPTIONS)
export const END_SELECT_ITEMS = toMinuteSelectItems(END_MINUTE_OPTIONS)
