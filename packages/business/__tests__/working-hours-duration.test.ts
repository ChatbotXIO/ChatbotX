import { describe, expect, test } from "vitest"
import {
  type WorkingInterval,
  workingSecondsBetween,
} from "../src/working-hours/duration"

const ALL_DAYS = (startMinute: number, endMinute: number): WorkingInterval[] =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute, endMinute }))
const WHOLE_DAY = ALL_DAYS(0, 1440)
const z = (iso: string) => new Date(iso)

describe("workingSecondsBetween", () => {
  test("floors fractional seconds so working seconds never exceed the raw total", () => {
    const from = z("2026-06-01T09:00:00.100Z")
    const to = z("2026-06-01T09:01:00.900Z")

    const working = workingSecondsBetween({
      from,
      to,
      intervals: WHOLE_DAY,
      timezone: "UTC",
    })

    expect(working).toBe(60)
    expect(working).toBeLessThanOrEqual(
      Math.floor((to.getTime() - from.getTime()) / 1000),
    )
  })

  test("returns 0 when to <= from", () => {
    const t = z("2026-06-01T10:00:00Z")
    expect(
      workingSecondsBetween({
        from: t,
        to: t,
        intervals: WHOLE_DAY,
        timezone: "UTC",
      }),
    ).toBe(0)
    expect(
      workingSecondsBetween({
        from: z("2026-06-01T11:00:00Z"),
        to: t,
        intervals: WHOLE_DAY,
        timezone: "UTC",
      }),
    ).toBe(0)
  })

  test("returns 0 with no intervals", () => {
    expect(
      workingSecondsBetween({
        from: z("2026-06-01T00:00:00Z"),
        to: z("2026-06-08T00:00:00Z"),
        intervals: [],
        timezone: "UTC",
      }),
    ).toBe(0)
  })

  test("Saturday message answered Monday counts only working hours (UTC, Mon-Fri 09-17)", () => {
    const intervals = [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startMinute: 540,
      endMinute: 1020,
    }))
    // Sat 2026-06-06 12:00 -> Mon 2026-06-08 10:30 = 1.5h
    expect(
      workingSecondsBetween({
        from: z("2026-06-06T12:00:00Z"),
        to: z("2026-06-08T10:30:00Z"),
        intervals,
        timezone: "UTC",
      }),
    ).toBe(5400)
  })

  test("Asia/Ho_Chi_Minh uses local dates (UTC+7, no DST)", () => {
    const intervals: WorkingInterval[] = [
      { weekday: 1, startMinute: 540, endMinute: 1020 },
    ]
    // Mon 2026-06-08 09:00-17:00 ICT = 02:00Z-10:00Z
    expect(
      workingSecondsBetween({
        from: z("2026-06-08T00:00:00Z"),
        to: z("2026-06-08T12:00:00Z"),
        intervals,
        timezone: "Asia/Ho_Chi_Minh",
      }),
    ).toBe(8 * 3600)
    // Sunday 20:00Z is already Monday 03:00 ICT
    expect(
      workingSecondsBetween({
        from: z("2026-06-07T20:00:00Z"),
        to: z("2026-06-08T03:00:00Z"),
        intervals,
        timezone: "Asia/Ho_Chi_Minh",
      }),
    ).toBe(3600)
  })

  test("1440 means next local midnight and joins consecutive days", () => {
    const intervals: WorkingInterval[] = [
      { weekday: 1, startMinute: 1380, endMinute: 1440 },
      { weekday: 2, startMinute: 0, endMinute: 60 },
    ]
    expect(
      workingSecondsBetween({
        from: z("2026-06-08T00:00:00Z"),
        to: z("2026-06-09T12:00:00Z"),
        intervals,
        timezone: "UTC",
      }),
    ).toBe(2 * 3600)
  })

  test("1440 on a DST day (Berlin spring) spans the real 23h day", () => {
    // 2026-03-29 is a Sunday (0)
    expect(
      workingSecondsBetween({
        from: z("2026-03-28T00:00:00Z"),
        to: z("2026-03-30T00:00:00Z"),
        intervals: [{ weekday: 0, startMinute: 0, endMinute: 1440 }],
        timezone: "Europe/Berlin",
      }),
    ).toBe(23 * 3600)
  })

  test("1440 on a DST day (Berlin fall-back) spans the real 25h day", () => {
    expect(
      workingSecondsBetween({
        from: z("2026-10-24T00:00:00Z"),
        to: z("2026-10-26T00:00:00Z"),
        intervals: [{ weekday: 0, startMinute: 0, endMinute: 1440 }],
        timezone: "Europe/Berlin",
      }),
    ).toBe(25 * 3600)
  })

  describe("Europe/Berlin spring forward 2026-03-29 (02:00 -> 03:00)", () => {
    const sunday = (startMinute: number, endMinute: number) =>
      workingSecondsBetween({
        from: z("2026-03-28T12:00:00Z"),
        to: z("2026-03-30T12:00:00Z"),
        intervals: [{ weekday: 0, startMinute, endMinute }],
        timezone: "Europe/Berlin",
      })

    test("02:00-03:00 (nonexistent hour) = 0 s", () => {
      expect(sunday(120, 180)).toBe(0)
    })
    test("01:00-04:00 = 7200 s", () => {
      expect(sunday(60, 240)).toBe(7200)
    })
    test("02:30-03:30 = 1800 s (gap start resolves to the transition instant)", () => {
      expect(sunday(150, 210)).toBe(1800)
    })
  })

  describe("Europe/Berlin fall back 2026-10-25 (03:00 -> 02:00)", () => {
    const sunday = (startMinute: number, endMinute: number) =>
      workingSecondsBetween({
        from: z("2026-10-24T12:00:00Z"),
        to: z("2026-10-26T12:00:00Z"),
        intervals: [{ weekday: 0, startMinute, endMinute }],
        timezone: "Europe/Berlin",
      })

    test("00:00-03:00 = 14400 s", () => {
      expect(sunday(0, 180)).toBe(14_400)
    })
    test("02:00-03:00 = 7200 s (ambiguous start resolves to the first occurrence)", () => {
      expect(sunday(120, 180)).toBe(7200)
    })
  })

  describe("America/New_York", () => {
    test("spring forward 2026-03-08: 02:00-03:00 = 0 s, 01:00-04:00 = 7200 s, 02:30-03:30 = 1800 s", () => {
      const sunday = (s: number, e: number) =>
        workingSecondsBetween({
          from: z("2026-03-07T12:00:00Z"),
          to: z("2026-03-09T12:00:00Z"),
          intervals: [{ weekday: 0, startMinute: s, endMinute: e }],
          timezone: "America/New_York",
        })
      expect(sunday(120, 180)).toBe(0)
      expect(sunday(60, 240)).toBe(7200)
      expect(sunday(150, 210)).toBe(1800)
    })

    test("fall back 2026-11-01: 00:00-03:00 = 14400 s, 01:00-02:00 = 7200 s", () => {
      const sunday = (s: number, e: number) =>
        workingSecondsBetween({
          from: z("2026-10-31T12:00:00Z"),
          to: z("2026-11-02T12:00:00Z"),
          intervals: [{ weekday: 0, startMinute: s, endMinute: e }],
          timezone: "America/New_York",
        })
      expect(sunday(0, 180)).toBe(14_400)
      expect(sunday(60, 120)).toBe(7200)
    })
  })

  test("clips to [from, to) inside an interval", () => {
    expect(
      workingSecondsBetween({
        from: z("2026-06-08T10:15:30Z"),
        to: z("2026-06-08T10:15:50Z"),
        intervals: WHOLE_DAY,
        timezone: "UTC",
      }),
    ).toBe(20)
  })

  test("multi-year span sums every week (no clamp)", () => {
    // Mon-only 09:00-10:00 UTC over 2024-01-01 .. 2027-01-01 (Mondays: 157)
    const seconds = workingSecondsBetween({
      from: z("2024-01-01T00:00:00Z"),
      to: z("2027-01-01T00:00:00Z"),
      intervals: [{ weekday: 1, startMinute: 540, endMinute: 600 }],
      timezone: "UTC",
    })
    expect(seconds).toBe(157 * 3600)
  })

  test("sorts unsorted intervals and sums several per day", () => {
    expect(
      workingSecondsBetween({
        from: z("2026-06-08T00:00:00Z"),
        to: z("2026-06-09T00:00:00Z"),
        intervals: [
          { weekday: 1, startMinute: 780, endMinute: 840 },
          { weekday: 1, startMinute: 540, endMinute: 600 },
        ],
        timezone: "UTC",
      }),
    ).toBe(7200)
  })
})

describe("workingSecondsBetween equivalence and performance", () => {
  const ZONES = [
    "UTC",
    "Europe/Berlin",
    "America/New_York",
    "Asia/Ho_Chi_Minh",
    "Australia/Lord_Howe",
    "America/Sao_Paulo",
  ]

  test.each(
    ZONES,
  )("a whole-day schedule equals the elapsed time in %s over 2023-2026", (timezone) => {
    const windows: [string, string][] = [
      ["2023-01-01T03:17:00Z", "2023-12-31T21:41:09Z"],
      ["2024-03-01T00:00:00Z", "2024-11-30T00:00:00Z"],
      ["2025-10-20T10:00:00Z", "2026-04-20T10:00:00Z"],
      ["2026-03-28T22:30:00Z", "2026-03-30T04:00:00Z"],
      ["2026-10-24T22:30:00Z", "2026-10-26T04:00:00Z"],
    ]
    for (const [from, to] of windows) {
      expect(
        workingSecondsBetween({
          from: z(from),
          to: z(to),
          intervals: WHOLE_DAY,
          timezone,
        }),
      ).toBe((Date.parse(to) - Date.parse(from)) / 1000)
    }
  })

  // Brute force reference: count real minutes whose local weekday/minute fall
  // inside an interval. Independent of the stepping/offset optimisation.
  const bruteForce = (
    from: string,
    to: string,
    intervals: WorkingInterval[],
    timezone: string,
  ) => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
    })
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    let seconds = 0
    for (let ms = Date.parse(from); ms < Date.parse(to); ms += 60_000) {
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
      )
      const weekday = weekdays.indexOf(parts.weekday)
      const minute = Number(parts.hour) * 60 + Number(parts.minute)
      if (
        intervals.some(
          (i) =>
            i.weekday === weekday &&
            minute >= i.startMinute &&
            minute < i.endMinute,
        )
      ) {
        seconds += 60
      }
    }
    return seconds
  }

  test.each([
    ["Europe/Berlin", "2026-03-24T00:00:00Z", "2026-04-02T00:00:00Z"],
    ["Europe/Berlin", "2026-10-21T00:00:00Z", "2026-10-30T00:00:00Z"],
    ["America/New_York", "2026-03-04T00:00:00Z", "2026-03-13T00:00:00Z"],
    ["America/New_York", "2026-10-28T00:00:00Z", "2026-11-06T00:00:00Z"],
  ])("matches a per-minute reference across the %s transition (%s)", (timezone, from, to) => {
    const intervals: WorkingInterval[] = [
      { weekday: 0, startMinute: 30, endMinute: 150 },
      { weekday: 0, startMinute: 150, endMinute: 210 },
      { weekday: 0, startMinute: 600, endMinute: 1440 },
      { weekday: 1, startMinute: 0, endMinute: 90 },
      { weekday: 5, startMinute: 540, endMinute: 1020 },
      { weekday: 6, startMinute: 120, endMinute: 180 },
    ]
    expect(
      workingSecondsBetween({ from: z(from), to: z(to), intervals, timezone }),
    ).toBe(bruteForce(from, to, intervals, timezone))
  })

  test("70 intervals per week over 5 years stays fast", () => {
    const intervals: WorkingInterval[] = []
    for (let weekday = 0; weekday < 7; weekday++) {
      for (let slot = 0; slot < 10; slot++) {
        intervals.push({
          weekday,
          startMinute: slot * 140,
          endMinute: slot * 140 + 60,
        })
      }
    }
    const args = {
      from: z("2022-01-01T00:00:00Z"),
      to: z("2027-01-01T00:00:00Z"),
      intervals,
      timezone: "Europe/Berlin",
    }
    workingSecondsBetween(args) // warm the Intl formatter
    const started = performance.now()
    const seconds = workingSecondsBetween(args)
    const elapsedMs = performance.now() - started
    expect(seconds).toBeGreaterThan(0)
    expect(elapsedMs).toBeLessThan(250)
  })
})
