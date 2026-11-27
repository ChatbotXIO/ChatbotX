import { describe, expect, test } from "vitest"
import {
  emptyPostingSlots,
  isPostingSlot,
  listFreeSlots,
  moveWallClockToZone,
  normalisePostingSlots,
  type PostingSchedule,
  postingScheduleSlots,
} from "../src/posting-slots"

const week = (days: Record<number, string[]>): PostingSchedule["slots"] =>
  emptyPostingSlots().map((day) => {
    const times = days[day.weekday]
    return times ? { enabled: true, times, weekday: day.weekday } : day
  })

const iso = (dates: Date[]): string[] => dates.map((d) => d.toISOString())

describe("listFreeSlots", () => {
  const utc: PostingSchedule = {
    slots: week({ 1: ["09:00", "17:30"], 3: ["12:00"] }),
    timezone: "UTC",
  }

  test("returns the next slots in order, strictly after the given instant", () => {
    // 2026-11-23 is a Monday.
    const slots = listFreeSlots({
      after: new Date("2026-11-23T09:00:00Z"),
      count: 4,
      occupied: [],
      schedule: utc,
    })
    expect(iso(slots)).toEqual([
      "2026-11-23T17:30:00.000Z",
      "2026-11-25T12:00:00.000Z",
      "2026-11-30T09:00:00.000Z",
      "2026-11-30T17:30:00.000Z",
    ])
  })

  test("skips an occupied slot", () => {
    const slots = listFreeSlots({
      after: new Date("2026-11-23T00:00:00Z"),
      count: 2,
      occupied: [new Date("2026-11-23T09:00:00Z")],
      schedule: utc,
    })
    expect(iso(slots)).toEqual([
      "2026-11-23T17:30:00.000Z",
      "2026-11-25T12:00:00.000Z",
    ])
  })

  test("a disabled day gives nothing even when it keeps its times", () => {
    const slots = listFreeSlots({
      after: new Date("2026-11-23T00:00:00Z"),
      count: 3,
      occupied: [],
      schedule: {
        slots: utc.slots.map((day) =>
          day.weekday === 1 ? { ...day, enabled: false } : day,
        ),
        timezone: "UTC",
      },
    })
    expect(iso(slots)).toEqual([
      "2026-11-25T12:00:00.000Z",
      "2026-12-02T12:00:00.000Z",
      "2026-12-09T12:00:00.000Z",
    ])
  })

  test("a schedule with no times returns nothing instead of looping", () => {
    expect(
      listFreeSlots({
        after: new Date(),
        count: 3,
        occupied: [],
        schedule: { slots: emptyPostingSlots(), timezone: "UTC" },
      }),
    ).toEqual([])
  })

  test("the local date follows the schedule's zone, not UTC", () => {
    // 2026-11-23T20:00Z is already Tuesday 03:00 in Ho Chi Minh (UTC+7).
    const slots = listFreeSlots({
      after: new Date("2026-11-23T20:00:00Z"),
      count: 1,
      occupied: [],
      schedule: { slots: week({ 2: ["08:00"] }), timezone: "Asia/Ho_Chi_Minh" },
    })
    expect(iso(slots)).toEqual(["2026-11-24T01:00:00.000Z"])
  })

  test("keeps the wall clock across the spring-forward change", () => {
    // New York: clocks go forward on 2027-03-14. 09:00 local is UTC-5 before, UTC-4 after.
    const schedule: PostingSchedule = {
      slots: week({ 6: ["09:00"], 0: ["09:00"] }),
      timezone: "America/New_York",
    }
    const slots = listFreeSlots({
      after: new Date("2027-03-12T00:00:00Z"),
      count: 3,
      occupied: [],
      schedule,
    })
    expect(iso(slots)).toEqual([
      "2027-03-13T14:00:00.000Z",
      "2027-03-14T13:00:00.000Z",
      "2027-03-20T13:00:00.000Z",
    ])
  })

  test("a time inside the skipped hour moves forward by the gap", () => {
    // 02:30 on 2027-03-14 does not exist in New York; it lands at 03:30 EDT = 07:30Z.
    const slots = listFreeSlots({
      after: new Date("2027-03-14T00:00:00Z"),
      count: 1,
      occupied: [],
      schedule: { slots: week({ 0: ["02:30"] }), timezone: "America/New_York" },
    })
    expect(iso(slots)).toEqual(["2027-03-14T07:30:00.000Z"])
  })

  test("an ambiguous time on the fall-back day takes the earlier instant", () => {
    // 01:30 on 2026-11-01 happens twice in New York; the first is 05:30Z (EDT).
    const slots = listFreeSlots({
      after: new Date("2026-10-31T12:00:00Z"),
      count: 1,
      occupied: [],
      schedule: { slots: week({ 0: ["01:30"] }), timezone: "America/New_York" },
    })
    expect(iso(slots)).toEqual(["2026-11-01T05:30:00.000Z"])
  })
})

describe("isPostingSlot", () => {
  test("matches a schedule time and nothing else", () => {
    const schedule: PostingSchedule = {
      slots: week({ 1: ["09:00"] }),
      timezone: "UTC",
    }
    expect(isPostingSlot(schedule, new Date("2026-11-23T09:00:00Z"))).toBe(true)
    expect(isPostingSlot(schedule, new Date("2026-11-23T09:01:00Z"))).toBe(
      false,
    )
    expect(isPostingSlot(schedule, new Date("2026-11-24T09:00:00Z"))).toBe(
      false,
    )
  })
})

describe("moveWallClockToZone", () => {
  test("keeps the date and the clock reading", () => {
    // 09:00 in Ho Chi Minh (02:00Z) is 09:00 in UTC when the zone changes.
    expect(
      moveWallClockToZone(
        new Date("2026-11-23T02:00:00Z"),
        "Asia/Ho_Chi_Minh",
        "UTC",
      ).toISOString(),
    ).toBe("2026-11-23T09:00:00.000Z")
  })
})

describe("postingScheduleSlots", () => {
  test("needs seven distinct weekdays and at most ten times a day", () => {
    expect(postingScheduleSlots.safeParse(emptyPostingSlots()).success).toBe(
      true,
    )
    expect(
      postingScheduleSlots.safeParse(emptyPostingSlots().slice(1)).success,
    ).toBe(false)
    const repeated = emptyPostingSlots().map((day) => ({ ...day, weekday: 0 }))
    expect(postingScheduleSlots.safeParse(repeated).success).toBe(false)
    const tooMany = emptyPostingSlots().map((day) => ({
      ...day,
      times: Array.from(
        { length: 11 },
        (_, i) => `${String(i).padStart(2, "0")}:00`,
      ),
    }))
    expect(postingScheduleSlots.safeParse(tooMany).success).toBe(false)
  })

  test("normalising sorts the weekdays and removes repeated times", () => {
    const shuffled = [...week({ 2: ["18:00", "09:00", "09:00"] })].reverse()
    const normal = normalisePostingSlots(shuffled)
    expect(normal.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(normal[2]?.times).toEqual(["09:00", "18:00"])
  })
})
