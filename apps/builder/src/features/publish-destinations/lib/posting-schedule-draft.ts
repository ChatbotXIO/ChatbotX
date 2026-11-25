import {
  normalisePostingSlots,
  POSTING_SLOT_MAX_TIMES_PER_DAY,
  type PostingScheduleSlots,
} from "@chatbotx.io/utils/posting-slots"

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** Whether `value` is an `HH:mm` wall-clock time. */
export const isSlotTime = (value: string): boolean => TIME_PATTERN.test(value)

const withDay = (
  slots: PostingScheduleSlots,
  weekday: number,
  change: (day: PostingScheduleSlots[number]) => PostingScheduleSlots[number],
): PostingScheduleSlots =>
  slots.map((day) => (day.weekday === weekday ? change(day) : day))

/** The day switched on or off; its times are kept so switching back loses nothing. */
export const setDayEnabled = (
  slots: PostingScheduleSlots,
  weekday: number,
  enabled: boolean,
): PostingScheduleSlots =>
  withDay(slots, weekday, (day) => ({ ...day, enabled }))

/**
 * The day with `time` added (sorted, no repeats); unchanged when the time is
 * malformed, already there or the day is full. Adding to an off day switches
 * it on: a time on an off day would never be used.
 */
export const addSlotTime = (
  slots: PostingScheduleSlots,
  weekday: number,
  time: string,
): PostingScheduleSlots =>
  withDay(slots, weekday, (day) => {
    if (
      !isSlotTime(time) ||
      day.times.includes(time) ||
      day.times.length >= POSTING_SLOT_MAX_TIMES_PER_DAY
    ) {
      return day
    }
    return { ...day, enabled: true, times: [...day.times, time].sort() }
  })

export const removeSlotTime = (
  slots: PostingScheduleSlots,
  weekday: number,
  time: string,
): PostingScheduleSlots =>
  withDay(slots, weekday, (day) => ({
    ...day,
    times: day.times.filter((existing) => existing !== time),
  }))

/** Gives every day in `targets` the on/off state and times of `from`. */
export const copyDayTo = (
  slots: PostingScheduleSlots,
  from: number,
  targets: readonly number[],
): PostingScheduleSlots => {
  const source = slots.find((day) => day.weekday === from)
  if (!source) {
    return slots
  }
  return slots.map((day) =>
    targets.includes(day.weekday) && day.weekday !== from
      ? { ...day, enabled: source.enabled, times: [...source.times] }
      : day,
  )
}

/** One spelling of a schedule, for comparing a draft with what is saved. */
export const slotsKey = (slots: PostingScheduleSlots): string =>
  JSON.stringify(normalisePostingSlots(slots))

/** Whether any day is on with at least one time: a schedule that can place a post. */
export const hasPostingTimes = (slots: PostingScheduleSlots): boolean =>
  slots.some((day) => day.enabled && day.times.length > 0)

/** Weekdays as the editor lists them: Monday first, Sunday last. */
export const EDITOR_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 0]
