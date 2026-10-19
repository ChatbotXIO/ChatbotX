import { describe, expect, test } from "vitest"
import {
  WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY,
  WORKING_HOURS_MAX_INTERVALS_TOTAL,
  workingHoursIntervalSchema,
  workingHoursIntervalsSchema,
} from "../src/partials/working-hours"

const interval = (weekday: number, startMinute: number, endMinute: number) => ({
  weekday,
  startMinute,
  endMinute,
})

describe("workingHoursIntervalSchema", () => {
  test("accepts the full day 00:00-24:00 and Sunday/Saturday bounds", () => {
    expect(
      workingHoursIntervalSchema.safeParse(interval(0, 0, 1440)).success,
    ).toBe(true)
    expect(
      workingHoursIntervalSchema.safeParse(interval(6, 1439, 1440)).success,
    ).toBe(true)
  })

  test.each([
    ["weekday below range", interval(-1, 0, 60)],
    ["weekday above range", interval(7, 0, 60)],
    ["negative start", interval(1, -1, 60)],
    ["start at 24:00", interval(1, 1440, 1441)],
    ["end above 24:00", interval(1, 0, 1441)],
    ["end equal to start", interval(1, 60, 60)],
    ["end before start", interval(1, 120, 60)],
    ["non-integer minute", interval(1, 0.5, 60)],
  ])("rejects %s", (_name, value) => {
    expect(workingHoursIntervalSchema.safeParse(value).success).toBe(false)
  })
})

describe("workingHoursIntervalsSchema", () => {
  test("accepts an empty list and adjacent (touching) intervals", () => {
    expect(workingHoursIntervalsSchema.safeParse([]).success).toBe(true)
    expect(
      workingHoursIntervalsSchema.safeParse([
        interval(1, 540, 720),
        interval(1, 720, 1020),
      ]).success,
    ).toBe(true)
  })

  test("rejects overlapping intervals on the same weekday regardless of order", () => {
    expect(
      workingHoursIntervalsSchema.safeParse([
        interval(1, 600, 900),
        interval(1, 540, 601),
      ]).success,
    ).toBe(false)
  })

  test("allows the same minutes on different weekdays", () => {
    expect(
      workingHoursIntervalsSchema.safeParse([
        interval(1, 540, 1020),
        interval(2, 540, 1020),
      ]).success,
    ).toBe(true)
  })

  test("rejects more than the per-weekday maximum", () => {
    const tooMany = Array.from(
      { length: WORKING_HOURS_MAX_INTERVALS_PER_WEEKDAY + 1 },
      (_, index) => interval(1, index * 60, index * 60 + 30),
    )
    expect(workingHoursIntervalsSchema.safeParse(tooMany).success).toBe(false)
    expect(
      workingHoursIntervalsSchema.safeParse(tooMany.slice(0, 10)).success,
    ).toBe(true)
  })

  test("rejects more than the total maximum", () => {
    const over = Array.from(
      { length: WORKING_HOURS_MAX_INTERVALS_TOTAL + 1 },
      (_, index) =>
        interval(
          Math.floor(index / 11),
          (index % 11) * 60,
          (index % 11) * 60 + 30,
        ),
    )
    expect(workingHoursIntervalsSchema.safeParse(over).success).toBe(false)
  })

  test("accepts exactly the total maximum", () => {
    const exact = Array.from(
      { length: WORKING_HOURS_MAX_INTERVALS_TOTAL },
      (_, index) =>
        interval(
          Math.floor(index / 10),
          (index % 10) * 60,
          (index % 10) * 60 + 30,
        ),
    )
    expect(workingHoursIntervalsSchema.safeParse(exact).success).toBe(true)
  })
})
