import { describe, expect, test } from "vitest"
import {
  type CallHoursSchedule,
  isWithinCallHours,
  parseCallTime,
} from "../src/whatsapp-call-hours"

const schedule = (
  over: Partial<CallHoursSchedule> = {},
): CallHoursSchedule => ({
  status: "ENABLED",
  timezoneId: "Asia/Ho_Chi_Minh",
  weeklyOperatingHours: [
    { dayOfWeek: "MONDAY", openTime: "0900", closeTime: "1700" },
  ],
  ...over,
})

/** A Monday, expressed in UTC. Vietnam is UTC+7. */
const mondayUtc = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 8, 14, hour, minute))

describe("parseCallTime", () => {
  test.each([
    ["0900", 540],
    ["09:00", 540],
    ["0000", 0],
    ["2359", 1439],
  ])("reads %s as %i minutes", (value, expected) => {
    expect(parseCallTime(value)).toBe(expected)
  })

  test.each([
    "",
    "abcd",
    "2460",
    "0960",
    "9",
  ])("rejects %s rather than guessing", (value) => {
    expect(parseCallTime(value)).toBeNull()
  })
})

describe("isWithinCallHours — open by default", () => {
  // A number must never become unreachable because its schedule is missing or
  // malformed; only a deliberate, well-formed schedule may refuse a call.
  test.each([
    ["no schedule at all", null],
    ["an undefined schedule", undefined],
  ])("%s accepts calls", (_label, value) => {
    expect(isWithinCallHours(value, mondayUtc(20))).toBe(true)
  })

  test("a DISABLED schedule accepts calls even outside its windows", () => {
    expect(
      isWithinCallHours(schedule({ status: "DISABLED" }), mondayUtc(20)),
    ).toBe(true)
  })

  test("an ENABLED schedule with no windows accepts calls", () => {
    expect(
      isWithinCallHours(schedule({ weeklyOperatingHours: [] }), mondayUtc(20)),
    ).toBe(true)
  })

  test("an unknown timezone accepts calls instead of locking customers out", () => {
    expect(
      isWithinCallHours(schedule({ timezoneId: "Not/AZone" }), mondayUtc(20)),
    ).toBe(true)
  })

  test("an unparseable window accepts calls rather than closing the number", () => {
    expect(
      isWithinCallHours(
        schedule({
          weeklyOperatingHours: [
            { dayOfWeek: "MONDAY", openTime: "nope", closeTime: "1700" },
          ],
        }),
        mondayUtc(3),
      ),
    ).toBe(true)
  })

  // The schedule is a jsonb column, so a legacy or hand-edited row can hold
  // shapes the type says are impossible. None of them may throw inside the
  // inbound gate, and none may make the number unreachable.
  test.each([
    ["a non-array weeklyOperatingHours", { foo: "bar" }],
    ["a null entry", [null]],
    ["a primitive entry", ["MONDAY"]],
    ["an entry with no day", [{ openTime: "0900", closeTime: "1700" }]],
    [
      "an entry with numeric times",
      [{ dayOfWeek: "MONDAY", openTime: 900, closeTime: 1700 }],
    ],
  ])("%s accepts calls instead of throwing", (_label, weeklyOperatingHours) => {
    // 03:00 UTC is Monday 10:00 local — the day these entries claim to cover,
    // so a shape that reads at all lands inside the window rather than outside.
    expect(
      isWithinCallHours(
        schedule({
          weeklyOperatingHours:
            weeklyOperatingHours as unknown as CallHoursSchedule["weeklyOperatingHours"],
        }),
        mondayUtc(3),
      ),
    ).toBe(true)
  })

  test("a day name Meta does not define accepts calls instead of closing the week", () => {
    // "FUNDAY" can never match any day, so treating it as a real restriction
    // would make the number unreachable seven days a week with no sign why.
    expect(
      isWithinCallHours(
        schedule({
          weeklyOperatingHours: [
            { dayOfWeek: "FUNDAY", openTime: "0900", closeTime: "1700" },
          ],
        }),
        mondayUtc(20),
      ),
    ).toBe(true)
  })

  test("a valid window still decides when a malformed one sits beside it", () => {
    const summary = isWithinCallHours(
      schedule({
        weeklyOperatingHours: [
          { dayOfWeek: "MONDAY", openTime: "0900", closeTime: "1700" },
          { dayOfWeek: "TUESDAY", openTime: "??", closeTime: "??" },
        ],
      }),
      mondayUtc(1),
    )

    expect(summary).toBe(false)
  })
})

describe("isWithinCallHours — the schedule is read in its own timezone", () => {
  // 09:00–17:00 in Asia/Ho_Chi_Minh is 02:00–10:00 UTC. Reading the clock in
  // UTC instead of the configured zone would invert every one of these.
  test("02:00 UTC is 09:00 local — open", () => {
    expect(isWithinCallHours(schedule(), mondayUtc(2))).toBe(true)
  })

  test("09:59 UTC is 16:59 local — still open", () => {
    expect(isWithinCallHours(schedule(), mondayUtc(9, 59))).toBe(true)
  })

  test("10:00 UTC is 17:00 local — closed, the close minute is exclusive", () => {
    expect(isWithinCallHours(schedule(), mondayUtc(10))).toBe(false)
  })

  test("01:59 UTC is 08:59 local — not open yet", () => {
    expect(isWithinCallHours(schedule(), mondayUtc(1, 59))).toBe(false)
  })

  test("a day with no window is closed all day", () => {
    // Tuesday 02:00 UTC = Tuesday 09:00 local, but only Monday is configured.
    expect(
      isWithinCallHours(schedule(), new Date(Date.UTC(2026, 8, 15, 2))),
    ).toBe(false)
  })
})

describe("isWithinCallHours — windows that run past midnight", () => {
  const overnight = (...days: string[]) =>
    schedule({
      timezoneId: "Etc/UTC",
      weeklyOperatingHours: days.map((dayOfWeek) => ({
        dayOfWeek,
        openTime: "2200",
        closeTime: "0200",
      })),
    })

  const at = (dayOfMonth: number, hour: number) =>
    new Date(Date.UTC(2026, 8, dayOfMonth, hour))

  test("open on the evening side of its own day", () => {
    expect(isWithinCallHours(overnight("MONDAY"), at(14, 23))).toBe(true)
  })

  test("open on the after-midnight side, which falls on the NEXT day", () => {
    expect(isWithinCallHours(overnight("MONDAY"), at(15, 1))).toBe(true)
  })

  test("closed once the spillover has passed", () => {
    expect(isWithinCallHours(overnight("MONDAY"), at(15, 3))).toBe(false)
  })

  test("closed in the gap before it opens", () => {
    expect(isWithinCallHours(overnight("MONDAY"), at(14, 21))).toBe(false)
  })

  // The regression: a MONDAY 22:00-02:00 window must NOT open Monday 01:00.
  // That early slot belongs to SUNDAY's window spilling over, and opening it
  // a day early would take calls a full day before the business intended.
  test("does NOT open the early hours of its own start day", () => {
    expect(isWithinCallHours(overnight("MONDAY"), at(14, 1))).toBe(false)
  })

  test("the previous day's window is what opens those early hours", () => {
    expect(isWithinCallHours(overnight("SUNDAY"), at(14, 1))).toBe(true)
  })

  test("wraps across the week boundary — Sunday into Monday", () => {
    // Sunday 13 Sep 2026 22:00 -> Monday 14 Sep 01:00.
    expect(isWithinCallHours(overnight("SUNDAY"), at(13, 23))).toBe(true)
    expect(isWithinCallHours(overnight("SUNDAY"), at(14, 1))).toBe(true)
  })
})

describe("isWithinCallHours — holiday overrides", () => {
  // Meta: holiday_schedule is "an optional override to the weekly schedule",
  // so on its date the holiday entry REPLACES the weekly hours entirely.
  const withHoliday = (holidaySchedule: CallHoursSchedule["holidaySchedule"]) =>
    schedule({ timezoneId: "Etc/UTC", holidaySchedule })

  const utc = (dayOfMonth: number, hour: number, minute = 0) =>
    new Date(Date.UTC(2026, 8, dayOfMonth, hour, minute))

  test("a shortened holiday closes hours the weekly schedule would have opened", () => {
    const schedules = withHoliday([
      { date: "2026-09-14", startTime: "0900", endTime: "1200" },
    ])

    // 14:00 is inside MONDAY 09:00-17:00, but the holiday ends at noon.
    expect(isWithinCallHours(schedules, utc(14, 14))).toBe(false)
    expect(isWithinCallHours(schedules, utc(14, 10))).toBe(true)
  })

  test("an all-day holiday stays open through its final minute", () => {
    const schedules = withHoliday([
      { date: "2026-09-14", startTime: "0000", endTime: "2359" },
    ])

    // 23:59 is outside MONDAY 09:00-17:00 — only the override opens it, and
    // an exclusive end would shut the number for that last minute.
    expect(isWithinCallHours(schedules, utc(14, 23, 59))).toBe(true)
    expect(isWithinCallHours(schedules, utc(14, 3))).toBe(true)
  })

  test("a holiday on another date leaves the weekly schedule alone", () => {
    const schedules = withHoliday([
      { date: "2026-12-25", startTime: "0000", endTime: "0000" },
    ])

    expect(isWithinCallHours(schedules, utc(14, 10))).toBe(true)
    expect(isWithinCallHours(schedules, utc(14, 20))).toBe(false)
  })

  test("the holiday date is read in the schedule's own timezone", () => {
    // 2026-09-14T18:00Z is already Tuesday the 15th in Auckland (UTC+12), so
    // a holiday filed for the 15th must apply — reading the UTC date would
    // miss it by a day.
    const schedules = schedule({
      timezoneId: "Pacific/Auckland",
      weeklyOperatingHours: [
        { dayOfWeek: "TUESDAY", openTime: "0900", closeTime: "1700" },
      ],
      holidaySchedule: [
        { date: "2026-09-15", startTime: "0000", endTime: "0100" },
      ],
    })

    // Local Tuesday 06:00 — inside neither the weekly window nor the holiday.
    expect(isWithinCallHours(schedules, utc(14, 18))).toBe(false)
    // Local Tuesday 00:30 — inside the holiday only.
    expect(isWithinCallHours(schedules, utc(14, 12, 30))).toBe(true)
  })

  // Meta requires start before end, so a range that inverts it is a row we
  // cannot read — and a holiday is the ONLY thing consulted on its date, so
  // misreading one would close the number for the whole day.
  test.each([
    ["a reversed range", "2200", "0200"],
    ["an empty range", "0900", "0900"],
  ])("%s accepts calls all day", (_label, startTime, endTime) => {
    const schedules = withHoliday([{ date: "2026-09-14", startTime, endTime }])

    expect(isWithinCallHours(schedules, utc(14, 5))).toBe(true)
    expect(isWithinCallHours(schedules, utc(14, 20))).toBe(true)
  })

  test("an unreadable holiday accepts calls rather than closing the number", () => {
    const schedules = withHoliday([
      { date: "2026-09-14", startTime: "??", endTime: "??" },
    ])

    expect(isWithinCallHours(schedules, utc(14, 20))).toBe(true)
  })
})

describe("isWithinCallHours — daylight saving", () => {
  // London is UTC+1 in summer and UTC+0 in winter. A fixed-offset
  // implementation passes one of these and fails the other.
  const london = schedule({
    timezoneId: "Europe/London",
    weeklyOperatingHours: [
      { dayOfWeek: "MONDAY", openTime: "0900", closeTime: "1700" },
    ],
  })

  test("summer: 08:00 UTC is 09:00 local — open", () => {
    expect(isWithinCallHours(london, new Date(Date.UTC(2026, 6, 13, 8)))).toBe(
      true,
    )
  })

  test("winter: 08:00 UTC is 08:00 local — not open yet", () => {
    expect(isWithinCallHours(london, new Date(Date.UTC(2026, 0, 12, 8)))).toBe(
      false,
    )
  })
})
