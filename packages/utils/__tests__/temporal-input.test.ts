import { describe, expect, test } from "vitest"
import { parseLooseTemporalValue } from "../src/temporal-input"

const VN = "Asia/Ho_Chi_Minh"
const NY = "America/New_York"

// Deliberately straddles midnight: this instant is already 2026-07-23 01:00 in
// Ho Chi Minh (+07) while still 2026-07-22 14:00 in New York (-04) and
// 2026-07-22 18:00 in UTC. Any test that anchors "today" off the server clock
// instead of the workspace zone will produce 2026-07-22 here and fail.
const CROSS_MIDNIGHT_NOW = new Date("2026-07-22T18:00:00Z")

describe("parseLooseTemporalValue - naive values", () => {
  test.each([
    ["datetime", "23/07/2026", "2026-07-23T00:00:00"],
    ["datetime", "23/07/2026 09:30", "2026-07-23T09:30:00"],
    ["datetime", "23/07/2026 09:30:45", "2026-07-23T09:30:45"],
    ["datetime", "2026-07-23", "2026-07-23T00:00:00"],
    ["datetime", "2026-07-23T09:30:00", "2026-07-23T09:30:00"],
    ["datetime", "2026-07-23T09:30:00.123", "2026-07-23T09:30:00"],
    ["datetime", "2026-07-23 09:30", "2026-07-23T09:30:00"],
    ["datetime", "Jul 23, 2026", "2026-07-23T00:00:00"],
    ["datetime", "23 July 2026", "2026-07-23T00:00:00"],
    ["datetime", "23-07-2026", "2026-07-23T00:00:00"],
    ["datetime", "23.07.2026", "2026-07-23T00:00:00"],
    ["date", "23/07/2026", "2026-07-23"],
    ["date", "23/07/2026 09:30", "2026-07-23"],
    ["date", "2026-07-23", "2026-07-23"],
    ["date", "Jul 23, 2026", "2026-07-23"],
  ] as const)("parses %s %j -> %j", (type, raw, expected) => {
    expect(parseLooseTemporalValue(type, raw, VN)).toBe(expected)
  })

  test("unpadded day and month components parse", () => {
    expect(parseLooseTemporalValue("date", "3/7/2026", VN)).toBe("2026-07-03")
  })

  test("day-first wins for ambiguous values", () => {
    expect(parseLooseTemporalValue("date", "12/07/2026", VN)).toBe("2026-07-12")
  })

  test("structurally impossible DMY falls through to the MDY rescue", () => {
    expect(parseLooseTemporalValue("date", "07/13/2026", VN)).toBe("2026-07-13")
  })

  test("compact yyyyMMdd parses as a calendar date, not unix seconds", () => {
    expect(parseLooseTemporalValue("date", "20260723", VN)).toBe("2026-07-23")
    expect(parseLooseTemporalValue("datetime", "20260723", VN)).toBe(
      "2026-07-23T00:00:00",
    )
  })

  test("localized numeric month labels parse", () => {
    expect(parseLooseTemporalValue("date", "23 thg 7, 2026", VN)).toBe(
      "2026-07-23",
    )
    expect(
      parseLooseTemporalValue("datetime", "23 tháng 7 2026 09:30", VN),
    ).toBe("2026-07-23T09:30:00")
    expect(
      parseLooseTemporalValue(
        "datetime",
        "ngày 23 tháng 7 năm 2026 lúc 09:30:45",
        VN,
      ),
    ).toBe("2026-07-23T09:30:45")
  })
})

describe("parseLooseTemporalValue - absolute instants", () => {
  test.each([
    ["1721800800", "2024-07-24T06:00:00.000Z"],
    ["1721800800000", "2024-07-24T06:00:00.000Z"],
    ["1700000000", "2023-11-14T22:13:20.000Z"],
    ["1700000000000", "2023-11-14T22:13:20.000Z"],
  ] as const)("datetime unix %j -> UTC %j", (raw, expected) => {
    expect(parseLooseTemporalValue("datetime", raw, VN)).toBe(expected)
  })

  test("datetime with explicit offset becomes a UTC instant", () => {
    expect(
      parseLooseTemporalValue("datetime", "2026-07-22T15:30:00+07:00", VN),
    ).toBe("2026-07-22T08:30:00.000Z")
  })

  test("datetime with Z remains the same UTC instant", () => {
    expect(
      parseLooseTemporalValue("datetime", "2026-07-22T08:30:00.000Z", VN),
    ).toBe("2026-07-22T08:30:00.000Z")
  })

  test("date from a unix instant resolves the calendar day in the anchor zone", () => {
    expect(parseLooseTemporalValue("date", "1700000000", VN)).toBe("2023-11-15")
    expect(parseLooseTemporalValue("date", "1721800800", VN)).toBe("2024-07-24")
  })

  test("short spreadsheet numerics are not treated as unix timestamps", () => {
    expect(parseLooseTemporalValue("datetime", "45497", VN)).toBeNull()
    expect(parseLooseTemporalValue("datetime", "2026", VN)).toBeNull()
    expect(parseLooseTemporalValue("datetime", "946684800000", VN)).toBeNull()
  })
})

describe("parseLooseTemporalValue - time-only values", () => {
  test.each([
    ["09:30", "2026-07-23T09:30:00"],
    ["9:30", "2026-07-23T09:30:00"],
    ["09:30:45", "2026-07-23T09:30:45"],
    ["9:30 AM", "2026-07-23T09:30:00"],
    ["9:30 PM", "2026-07-23T21:30:00"],
    ["23:59", "2026-07-23T23:59:00"],
    ["00:00", "2026-07-23T00:00:00"],
  ] as const)("datetime %j takes today in the anchor zone -> %j", (raw, expected) => {
    expect(
      parseLooseTemporalValue("datetime", raw, VN, CROSS_MIDNIGHT_NOW),
    ).toBe(expected)
  })

  test("today comes from the anchor zone, not the server clock", () => {
    // Same instant, same input, two zones on opposite sides of midnight.
    expect(
      parseLooseTemporalValue("datetime", "09:30", VN, CROSS_MIDNIGHT_NOW),
    ).toBe("2026-07-23T09:30:00")
    expect(
      parseLooseTemporalValue("datetime", "09:30", NY, CROSS_MIDNIGHT_NOW),
    ).toBe("2026-07-22T09:30:00")
  })

  test("a date field keeps only today's calendar day", () => {
    expect(
      parseLooseTemporalValue("date", "09:30", VN, CROSS_MIDNIGHT_NOW),
    ).toBe("2026-07-23")
  })

  test.each([
    "25:00",
    "24:00",
    "9:60",
    "12:30 XM",
    "9:",
    ":30",
    "1030",
  ] as const)("returns null for the invalid time %j", (raw) => {
    expect(
      parseLooseTemporalValue("datetime", raw, VN, CROSS_MIDNIGHT_NOW),
    ).toBeNull()
  })

  test("a full date-time still wins over the time-only fallback", () => {
    // Ordering guard: the time-only matcher must never shadow a value that
    // already carries its own calendar day.
    expect(
      parseLooseTemporalValue(
        "datetime",
        "23/07/2026 09:30",
        VN,
        CROSS_MIDNIGHT_NOW,
      ),
    ).toBe("2026-07-23T09:30:00")
  })
})

describe("parseLooseTemporalValue - meridiem (AM/PM) inputs", () => {
  test.each([
    ["9:30 AM", "2026-07-23T09:30:00"],
    ["9:30 PM", "2026-07-23T21:30:00"],
    ["9:30 am", "2026-07-23T09:30:00"],
    ["9:30 p.m.", "2026-07-23T21:30:00"],
    // Glued and minute-less spellings survive input normalization.
    ["9:30AM", "2026-07-23T09:30:00"],
    ["9:30pm", "2026-07-23T21:30:00"],
    ["9 PM", "2026-07-23T21:00:00"],
    ["9:30:45 PM", "2026-07-23T21:30:45"],
    // Midnight and noon are the two spots a 12-hour clock usually gets wrong.
    ["12:00 AM", "2026-07-23T00:00:00"],
    ["12:00 PM", "2026-07-23T12:00:00"],
  ] as const)("time-only %j -> %j", (raw, expected) => {
    expect(
      parseLooseTemporalValue("datetime", raw, VN, CROSS_MIDNIGHT_NOW),
    ).toBe(expected)
  })

  test.each([
    // Every date shape must accept a meridiem clock, not just the US one.
    ["23/07/2026 09:30 PM", "2026-07-23T21:30:00"],
    ["07/23/2026 9:30 AM", "2026-07-23T09:30:00"],
    ["2026-07-23 09:30 PM", "2026-07-23T21:30:00"],
    ["2026-07-23T09:30 PM", "2026-07-23T21:30:00"],
    ["23-07-2026 9:30 PM", "2026-07-23T21:30:00"],
    ["23.07.2026 9:30 PM", "2026-07-23T21:30:00"],
    ["Jul 23, 2026 9:30 PM", "2026-07-23T21:30:00"],
    ["23 Jul 2026 9:30 PM", "2026-07-23T21:30:00"],
    ["July 23, 2026 9:30 PM", "2026-07-23T21:30:00"],
    ["Jul 23, 2026 9:30:45 PM", "2026-07-23T21:30:45"],
    ["23 tháng 7 2026 9:30 PM", "2026-07-23T21:30:00"],
    ["ngày 23 tháng 7 năm 2026 lúc 9:30 PM", "2026-07-23T21:30:00"],
  ] as const)("dated %j -> %j", (raw, expected) => {
    expect(parseLooseTemporalValue("datetime", raw, VN)).toBe(expected)
  })

  test("an ambiguous day reads the same with a 24-hour or a meridiem clock", () => {
    // Regression guard: while the day-first and month-first shapes carried
    // different clock variants, `07/12/2026 09:30` resolved to 7 December but
    // `07/12/2026 9:30 AM` resolved to 12 July. Both must be day-first now.
    expect(parseLooseTemporalValue("date", "07/12/2026", VN)).toBe("2026-12-07")
    expect(parseLooseTemporalValue("date", "07/12/2026 09:30", VN)).toBe(
      "2026-12-07",
    )
    expect(parseLooseTemporalValue("date", "07/12/2026 9:30 AM", VN)).toBe(
      "2026-12-07",
    )
  })

  test("meridiem normalization leaves non-meridiem text alone", () => {
    expect(parseLooseTemporalValue("datetime", "12:30 XM", VN)).toBeNull()
    expect(parseLooseTemporalValue("datetime", "diagram", VN)).toBeNull()
  })
})

describe("parseLooseTemporalValue - Vietnamese meridiem markers", () => {
  test.each([
    // Google Sheets under a Vietnamese locale writes SA/CH, not AM/PM.
    ["9:30 SA", "2026-07-23T09:30:00"],
    ["9:30 CH", "2026-07-23T21:30:00"],
    ["9:30 sa", "2026-07-23T09:30:00"],
    ["9:30 ch", "2026-07-23T21:30:00"],
    ["9:30SA", "2026-07-23T09:30:00"],
    ["12:00 SA", "2026-07-23T00:00:00"],
    ["12:00 CH", "2026-07-23T12:00:00"],
    // Spelled-out day periods, with and without diacritics.
    ["9:30 sáng", "2026-07-23T09:30:00"],
    ["9:30 sang", "2026-07-23T09:30:00"],
    ["9:30 chiều", "2026-07-23T21:30:00"],
    ["9:30 chieu", "2026-07-23T21:30:00"],
    ["9:30 tối", "2026-07-23T21:30:00"],
    ["9:30 toi", "2026-07-23T21:30:00"],
  ] as const)("time-only %j -> %j", (raw, expected) => {
    expect(
      parseLooseTemporalValue("datetime", raw, VN, CROSS_MIDNIGHT_NOW),
    ).toBe(expected)
  })

  test.each([
    ["23/07/2026 9:30 CH", "2026-07-23T21:30:00"],
    ["23/07/2026 9:30 SA", "2026-07-23T09:30:00"],
    ["2026-07-23 9:30 CH", "2026-07-23T21:30:00"],
    ["23 thg 7 2026 9:30 CH", "2026-07-23T21:30:00"],
    ["ngày 23 tháng 7 năm 2026 lúc 9:30 CH", "2026-07-23T21:30:00"],
    // The localized clock pattern only recognizes the normalized `am`/`pm`
    // spelling, so every other spelling reaching it proves normalization ran
    // first. Locks the two ends of that pipeline together.
    ["ngày 23 tháng 7 năm 2026 lúc 9:30 p.m.", "2026-07-23T21:30:00"],
    ["ngày 23 tháng 7 năm 2026 lúc 9:30 SA", "2026-07-23T09:30:00"],
  ] as const)("dated %j -> %j", (raw, expected) => {
    expect(parseLooseTemporalValue("datetime", raw, VN)).toBe(expected)
  })

  test.each([
    "9:30 trưa",
    "9:30 đêm",
    "9:30 trua",
    "9:30 dem",
  ] as const)("rejects the ambiguous day period %j", (raw) => {
    // `trưa` and `đêm` straddle the 12-hour boundary — "11 giờ trưa" is 11:00
    // but "12 giờ trưa" is 12:00, and "1 giờ đêm" is 01:00 while "11 giờ đêm"
    // is 23:00. Skipping the cell beats silently storing the wrong half-day.
    expect(
      parseLooseTemporalValue("datetime", raw, VN, CROSS_MIDNIGHT_NOW),
    ).toBeNull()
  })

  test("Vietnamese markers do not fire without a preceding clock digit", () => {
    expect(parseLooseTemporalValue("datetime", "sang", VN)).toBeNull()
    expect(parseLooseTemporalValue("datetime", "March", VN)).toBeNull()
  })
})

describe("parseLooseTemporalValue - unrecognized input", () => {
  test.each([
    ["datetime", ""],
    ["datetime", "   "],
    ["datetime", "not-a-date"],
    ["date", "hello world"],
    ["date", "2026-02-30"],
    ["date", "32/01/2026"],
    ["datetime", "2026-13-01"],
  ] as const)("returns null for %s %j", (type, raw) => {
    expect(parseLooseTemporalValue(type, raw, VN)).toBeNull()
  })
})
