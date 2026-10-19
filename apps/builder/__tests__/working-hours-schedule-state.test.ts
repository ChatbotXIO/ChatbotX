// @vitest-environment node
import { workingHoursIntervalsSchema } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  addInterval,
  canAddInterval,
  DISPLAY_WEEKDAYS,
  intervalsOfWeekday,
  removeIntervalAt,
  setIntervalBoundary,
  sortIntervals,
  toggleWeekday,
  validateSchedule,
} from "../src/features/working-hours/lib/schedule-state"

const MONDAY = 1
const SUNDAY = 0

describe("working-hours schedule state", () => {
  test("displays Monday first and Sunday last", () => {
    expect(DISPLAY_WEEKDAYS[0]).toBe(MONDAY)
    expect(DISPLAY_WEEKDAYS.at(-1)).toBe(SUNDAY)
    expect([...DISPLAY_WEEKDAYS].sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  test("turning a day on seeds 09:00-17:00", () => {
    expect(toggleWeekday([], MONDAY, true)).toEqual([
      { weekday: MONDAY, startMinute: 540, endMinute: 1020 },
    ])
  })

  test("turning an already-on day on keeps its intervals", () => {
    const existing = [{ weekday: MONDAY, startMinute: 600, endMinute: 660 }]
    expect(toggleWeekday(existing, MONDAY, true)).toEqual(existing)
  })

  test("turning a day off removes only that day's intervals", () => {
    const state = [
      { weekday: MONDAY, startMinute: 540, endMinute: 720 },
      { weekday: MONDAY, startMinute: 780, endMinute: 1020 },
      { weekday: 2, startMinute: 540, endMinute: 1020 },
    ]
    expect(toggleWeekday(state, MONDAY, false)).toEqual([state[2]])
  })

  test("add appends a one-hour range after the last one", () => {
    const next = addInterval(
      [{ weekday: MONDAY, startMinute: 540, endMinute: 1020 }],
      MONDAY,
    )
    expect(intervalsOfWeekday(next, MONDAY).map((row) => row.interval)).toEqual(
      [
        { weekday: MONDAY, startMinute: 540, endMinute: 1020 },
        { weekday: MONDAY, startMinute: 1020, endMinute: 1080 },
      ],
    )
    expect(validateSchedule(next).size).toBe(0)
  })

  test("add is capped at 10 ranges per day", () => {
    let state = [{ weekday: MONDAY, startMinute: 0, endMinute: 15 }]
    for (let step = 0; step < 20; step++) {
      state = addInterval(state, MONDAY)
    }
    expect(intervalsOfWeekday(state, MONDAY)).toHaveLength(10)
    expect(canAddInterval(state, MONDAY)).toBe(false)
    expect(workingHoursIntervalsSchema.safeParse(state).success).toBe(true)
  })

  test("add is refused when the day already ends at 24:00", () => {
    const state = [{ weekday: MONDAY, startMinute: 0, endMinute: 1440 }]
    expect(canAddInterval(state, MONDAY)).toBe(false)
    expect(addInterval(state, MONDAY)).toEqual(state)
  })

  test("remove and boundary updates do not mutate the input", () => {
    const state = Object.freeze([
      { weekday: MONDAY, startMinute: 540, endMinute: 1020 },
      { weekday: 2, startMinute: 540, endMinute: 1020 },
    ])
    expect(removeIntervalAt(state, 0)).toEqual([state[1]])
    expect(setIntervalBoundary(state, 1, "endMinute", 1080)[1].endMinute).toBe(
      1080,
    )
    expect(state[1].endMinute).toBe(1020)
  })

  test("blocks overlapping ranges, including a contained range", () => {
    const state = [
      { weekday: MONDAY, startMinute: 540, endMinute: 1020 },
      { weekday: MONDAY, startMinute: 600, endMinute: 660 },
      { weekday: MONDAY, startMinute: 720, endMinute: 780 },
    ]
    expect(validateSchedule(state).get(MONDAY)).toBe("overlap")
  })

  test("adjacent ranges (end == next start) are allowed", () => {
    const state = [
      { weekday: MONDAY, startMinute: 540, endMinute: 720 },
      { weekday: MONDAY, startMinute: 720, endMinute: 1020 },
    ]
    expect(validateSchedule(state).size).toBe(0)
  })

  test("blocks end <= start", () => {
    const state = [
      { weekday: 3, startMinute: 600, endMinute: 600 },
      { weekday: 4, startMinute: 900, endMinute: 600 },
    ]
    const errors = validateSchedule(state)
    expect(errors.get(3)).toBe("order")
    expect(errors.get(4)).toBe("order")
  })

  test("reports errors per weekday only", () => {
    const state = [
      { weekday: MONDAY, startMinute: 540, endMinute: 720 },
      { weekday: MONDAY, startMinute: 600, endMinute: 780 },
      { weekday: 2, startMinute: 540, endMinute: 720 },
    ]
    const errors = validateSchedule(state)
    expect(errors.has(MONDAY)).toBe(true)
    expect(errors.has(2)).toBe(false)
  })

  test("sortIntervals orders by weekday then start without mutating", () => {
    const state = [
      { weekday: 2, startMinute: 600, endMinute: 660 },
      { weekday: MONDAY, startMinute: 780, endMinute: 840 },
      { weekday: MONDAY, startMinute: 540, endMinute: 600 },
    ]
    expect(sortIntervals(state).map((i) => [i.weekday, i.startMinute])).toEqual(
      [
        [1, 540],
        [1, 780],
        [2, 600],
      ],
    )
    expect(state[0].weekday).toBe(2)
  })
})
