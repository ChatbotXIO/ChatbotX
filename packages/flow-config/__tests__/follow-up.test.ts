import { afterEach, describe, expect, test, vi } from "vitest"
import {
  buildJobId,
  computeFollowUpTriggerAt,
  delayUnitToMs,
  followUpStepDefaultFn,
  followUpStepSchema,
  stepTypes,
  waitStepDelayTypes,
  waitStepDelayUnits,
  waitStepSchema,
} from "../src"

describe("follow up step schema", () => {
  test("creates the default one-hour follow-up step", () => {
    expect(followUpStepDefaultFn()).toMatchObject({
      stepType: stepTypes.enum.followUp,
      duration: 1,
      unit: waitStepDelayUnits.enum.hours,
    })
  })

  test.each([
    { duration: 366, unit: waitStepDelayUnits.enum.days },
    { duration: 8784, unit: waitStepDelayUnits.enum.hours },
  ])("accepts the 366-day boundary for $duration $unit", (delay) => {
    expect(
      followUpStepSchema.safeParse({
        id: "1",
        stepType: stepTypes.enum.followUp,
        ...delay,
      }).success,
    ).toBe(true)
  })

  test.each([
    { duration: 367, unit: waitStepDelayUnits.enum.days },
    { duration: 8785, unit: waitStepDelayUnits.enum.hours },
  ])("rejects delays longer than 366 days for $duration $unit", (delay) => {
    const result = followUpStepSchema.safeParse({
      id: "1",
      stepType: stepTypes.enum.followUp,
      ...delay,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["duration"])
  })
})

describe("follow up timing helpers", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test.each([
    [waitStepDelayUnits.enum.seconds, 1000],
    [waitStepDelayUnits.enum.minutes, 60_000],
    [waitStepDelayUnits.enum.hours, 3_600_000],
    [waitStepDelayUnits.enum.days, 86_400_000],
  ])("maps %s to milliseconds", (unit, expectedMs) => {
    expect(delayUnitToMs(unit)).toBe(expectedMs)
  })

  test("computes triggerAt using the selected delay unit", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"))

    const triggerAt = computeFollowUpTriggerAt({
      id: "1",
      stepType: stepTypes.enum.followUp,
      duration: 2,
      unit: waitStepDelayUnits.enum.minutes,
    })

    expect(triggerAt).toEqual(new Date("2026-07-16T00:02:00.000Z"))
  })

  test("wait duration schema still parses after delay-unit refactor", () => {
    expect(
      waitStepSchema.safeParse({
        id: "1",
        stepType: stepTypes.enum.wait,
        delayType: waitStepDelayTypes.enum.duration,
        duration: 1,
        unit: waitStepDelayUnits.enum.hours,
        interval: false,
        startTime: null,
        endTime: null,
      }).success,
    ).toBe(true)
  })

  test("buildJobId includes triggerAt so rescheduled rows arm new wake-ups", () => {
    expect(buildJobId("row-1", new Date("2026-07-16T00:01:00.000Z"))).toBe(
      "smart-delay-row-1-1784160060000",
    )
  })
})
