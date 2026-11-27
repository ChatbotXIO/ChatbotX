import { describe, expect, test, vi } from "vitest"

vi.mock("../src/errors", () => ({
  validationException: (field: string, message: string) =>
    Object.assign(new Error(message), { field }),
}))

const {
  assertSchedulePlan,
  assertScheduleWindow,
  MISSED_SCHEDULE_WINDOW_MS,
  SCHEDULE_MAX_LEAD_MS,
  SCHEDULE_MIN_LEAD_MS,
} = await import("../src/social-post/schedule-policy")

const now = new Date("2026-11-23T00:00:00Z")
const at = (ms: number) => new Date(now.getTime() + ms)

describe("schedule window", () => {
  test("needs at least two minutes of lead and at most one year", () => {
    expect(() =>
      assertScheduleWindow(at(SCHEDULE_MIN_LEAD_MS), now),
    ).not.toThrow()
    expect(() =>
      assertScheduleWindow(at(SCHEDULE_MIN_LEAD_MS - 1), now),
    ).toThrow("2 minutes")
    expect(() =>
      assertScheduleWindow(at(SCHEDULE_MAX_LEAD_MS), now),
    ).not.toThrow()
    expect(() =>
      assertScheduleWindow(at(SCHEDULE_MAX_LEAD_MS + 1), now),
    ).toThrow("one year")
    expect(() => assertScheduleWindow(new Date("nope"), now)).toThrow("valid")
  })

  test("a post that is late by six hours is the limit of publishing late", () => {
    expect(MISSED_SCHEDULE_WINDOW_MS).toBe(6 * 60 * 60 * 1000)
  })
})

describe("schedule plan", () => {
  test("a time and a queue together, or neither, are refused", () => {
    expect(() =>
      assertSchedulePlan({ queue: "next", scheduledAt: at(3_600_000) }, now),
    ).toThrow("not both")
    expect(() => assertSchedulePlan({}, now)).toThrow("scheduledAt or queue")
  })

  test("a queue, a time, or per-destination times are accepted; each time is checked", () => {
    expect(() => assertSchedulePlan({ queue: "top" }, now)).not.toThrow()
    expect(() =>
      assertSchedulePlan(
        { scheduledAt: at(3_600_000), timezone: "Asia/Ho_Chi_Minh" },
        now,
      ),
    ).not.toThrow()
    expect(() =>
      assertSchedulePlan({ targetTimes: { d1: at(1000) } }, now),
    ).toThrow("2 minutes")
  })

  test("an unknown time zone is refused", () => {
    expect(() =>
      assertSchedulePlan({ queue: "next", timezone: "+07:00" }, now),
    ).toThrow("IANA")
  })
})
