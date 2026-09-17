// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  buildCallHoursFormValues,
  CALL_HOURS_DAYS,
  formatMetaCallTime,
  parseMetaCallTime,
  toMetaCallHours,
  upcomingHolidays,
} from "../src/features/integration-whatsapp/calling/lib/call-hours"
import {
  type CallHoursFormValues,
  CallHoursIssue,
  callHoursFormSchema,
} from "../src/features/integration-whatsapp/calling/schemas/call-hours-schema"

const closedWeek = (): CallHoursFormValues["days"] =>
  CALL_HOURS_DAYS.map((dayOfWeek) => ({ dayOfWeek, ranges: [] }))

const weekWith = (
  ranges: Partial<Record<(typeof CALL_HOURS_DAYS)[number], [number, number][]>>,
): CallHoursFormValues["days"] =>
  closedWeek().map((day) => ({
    ...day,
    ranges: (ranges[day.dayOfWeek] ?? []).map(([openMinute, closeMinute]) => ({
      openMinute,
      closeMinute,
    })),
  }))

const issuesOf = (values: CallHoursFormValues) => {
  const result = callHoursFormSchema.safeParse(values)
  return result.success ? [] : result.error.issues.map((i) => i.message)
}

describe("Meta call time conversion", () => {
  test("parses Meta's HHMM and the colon form its reference also shows", () => {
    expect(parseMetaCallTime("0400")).toBe(240)
    expect(parseMetaCallTime("1020")).toBe(620)
    expect(parseMetaCallTime("04:00")).toBe(240)
    expect(parseMetaCallTime("2359")).toBe(1439)
  })

  test("rejects anything that is not a real time of day", () => {
    expect(parseMetaCallTime("2400")).toBeNull()
    expect(parseMetaCallTime("0960")).toBeNull()
    expect(parseMetaCallTime("930")).toBeNull()
    expect(parseMetaCallTime("")).toBeNull()
  })

  test("formats minutes as zero-padded HHMM", () => {
    expect(formatMetaCallTime(0)).toBe("0000")
    expect(formatMetaCallTime(68)).toBe("0108")
    expect(formatMetaCallTime(1439)).toBe("2359")
  })
})

describe("buildCallHoursFormValues", () => {
  test("defaults a number with no call hours to weekdays 09:00-17:00 in the workspace timezone, switched off", () => {
    const values = buildCallHoursFormValues(undefined, "Asia/Ho_Chi_Minh")

    expect(values.enabled).toBe(false)
    expect(values.timezoneId).toBe("Asia/Ho_Chi_Minh")
    expect(values.days.map((day) => day.ranges.length)).toEqual([
      1, 1, 1, 1, 1, 0, 0,
    ])
    expect(values.days[0].ranges[0]).toEqual({
      openMinute: 540,
      closeMinute: 1020,
    })
  })

  test("never seeds a timezone the runtime cannot use", () => {
    expect(buildCallHoursFormValues(undefined, "Factory").timezoneId).toBe(
      "Etc/UTC",
    )
  })

  test("falls back to Etc/UTC when the workspace timezone is not a known IANA code", () => {
    expect(buildCallHoursFormValues(undefined, "UTC").timezoneId).toBe(
      "Etc/UTC",
    )
  })

  test("loads Meta's schedule, grouping ranges by day in week order", () => {
    const values = buildCallHoursFormValues(
      {
        status: "ENABLED",
        timezone_id: "America/Manaus",
        weekly_operating_hours: [
          { day_of_week: "TUESDAY", open_time: "1300", close_time: "1700" },
          { day_of_week: "MONDAY", open_time: "0400", close_time: "1020" },
          { day_of_week: "TUESDAY", open_time: "0108", close_time: "1020" },
        ],
      },
      "Asia/Ho_Chi_Minh",
    )

    expect(values.enabled).toBe(true)
    expect(values.timezoneId).toBe("America/Manaus")
    expect(values.days[0].ranges).toEqual([
      { openMinute: 240, closeMinute: 620 },
    ])
    expect(values.days[1].ranges).toEqual([
      { openMinute: 68, closeMinute: 620 },
      { openMinute: 780, closeMinute: 1020 },
    ])
  })
})

describe("toMetaCallHours", () => {
  test("sends the whole schedule as Meta HHMM entries", () => {
    const hours = toMetaCallHours({
      enabled: true,
      timezoneId: "Asia/Ho_Chi_Minh",
      days: weekWith({
        MONDAY: [
          [540, 720],
          [780, 1080],
        ],
        SUNDAY: [[0, 1439]],
      }),
    })

    expect(hours).toEqual({
      status: "ENABLED",
      timezone_id: "Asia/Ho_Chi_Minh",
      weekly_operating_hours: [
        { day_of_week: "MONDAY", open_time: "0900", close_time: "1200" },
        { day_of_week: "MONDAY", open_time: "1300", close_time: "1800" },
        { day_of_week: "SUNDAY", open_time: "0000", close_time: "2359" },
      ],
    })
  })

  test("carries the holiday schedule it is given, since Meta replaces call_hours wholesale", () => {
    const hours = toMetaCallHours(
      {
        enabled: false,
        timezoneId: "Asia/Ho_Chi_Minh",
        days: weekWith({ MONDAY: [[540, 1020]] }),
      },
      [{ date: "2026-12-25", start_time: "0000", end_time: "2359" }],
    )

    expect(hours.status).toBe("DISABLED")
    expect(hours.holiday_schedule).toEqual([
      { date: "2026-12-25", start_time: "0000", end_time: "2359" },
    ])
  })
})

describe("upcomingHolidays", () => {
  test("drops holidays already past in the number's timezone, which Meta would reject", () => {
    // 2026-09-17 01:00 in Ho Chi Minh is still 2026-09-16 in UTC.
    const now = new Date("2026-09-16T18:00:00Z")
    const holidays = [
      { date: "2026-09-16", start_time: "0000", end_time: "2359" },
      { date: "2026-09-17", start_time: "0000", end_time: "2359" },
      { date: "2027-01-01", start_time: "0000", end_time: "2359" },
    ]

    expect(upcomingHolidays(holidays, "Asia/Ho_Chi_Minh", now)).toEqual([
      holidays[1],
      holidays[2],
    ])
    expect(upcomingHolidays(undefined, "Asia/Ho_Chi_Minh", now)).toBeUndefined()
  })
})

describe("callHoursFormSchema", () => {
  const base = {
    enabled: true,
    timezoneId: "Asia/Ho_Chi_Minh",
  }

  test("accepts up to two separate ranges a day", () => {
    expect(
      issuesOf({
        ...base,
        days: weekWith({
          MONDAY: [
            [540, 720],
            [780, 1020],
          ],
        }),
      }),
    ).toEqual([])
  })

  test("rejects a range that closes before it opens, which is how an overnight range must be split", () => {
    expect(
      issuesOf({ ...base, days: weekWith({ MONDAY: [[1320, 120]] }) }),
    ).toContain(CallHoursIssue.rangeOrder)
  })

  test("rejects overlapping ranges on the same day", () => {
    expect(
      issuesOf({
        ...base,
        days: weekWith({
          MONDAY: [
            [540, 780],
            [720, 1020],
          ],
        }),
      }),
    ).toContain(CallHoursIssue.rangeOverlap)
  })

  test("rejects a third range on one day", () => {
    const result = callHoursFormSchema.safeParse({
      ...base,
      days: weekWith({
        MONDAY: [
          [0, 60],
          [120, 180],
          [240, 300],
        ],
      }),
    })
    expect(result.success).toBe(false)
  })

  test("requires at least one open range even when call hours are off, because Meta does", () => {
    expect(issuesOf({ ...base, enabled: false, days: closedWeek() })).toContain(
      CallHoursIssue.noOpenHours,
    )
  })

  test("rejects an unknown timezone", () => {
    expect(
      callHoursFormSchema.safeParse({
        ...base,
        timezoneId: "Mars/Olympus_Mons",
        days: weekWith({ MONDAY: [[540, 1020]] }),
      }).success,
    ).toBe(false)
  })

  test("rejects a timezone the runtime cannot use, even though the timezone list carries it", () => {
    // `countries-and-timezones` lists `Factory`, which `Intl` refuses.
    expect(
      callHoursFormSchema.safeParse({
        ...base,
        timezoneId: "Factory",
        days: weekWith({ MONDAY: [[540, 1020]] }),
      }).success,
    ).toBe(false)
  })

  test("requires the seven days, in week order", () => {
    const days = weekWith({ MONDAY: [[540, 1020]] })
    expect(
      callHoursFormSchema.safeParse({ ...base, days: days.slice(0, 6) })
        .success,
    ).toBe(false)
    expect(
      callHoursFormSchema.safeParse({ ...base, days: [...days].reverse() })
        .success,
    ).toBe(false)
  })
})
