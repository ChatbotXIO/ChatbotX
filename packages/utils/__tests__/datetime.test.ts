import { describe, expect, test } from "vitest"
import {
  currentTemporalLiteral,
  DEFAULT_FILTER_TIMEZONE,
  datePartOf,
  detectTemporalPrecision,
  filterValueToUtcDayEndIso,
  filterValueToUtcDayStartIso,
  filterValueToUtcInstantWindow,
  filterValueToUtcIso,
  formatCustomFieldValueInTimeZone,
  hasExplicitOffset,
  hasTimeComponent,
  isRealCalendarDate,
  normalizeTemporalCustomFieldValue,
  resolveFilterTimezone,
  resolveTemporalCustomFieldFormValue,
  resolveTemporalCustomFieldSaveFormat,
  SourceTimezoneStrategy,
  TemporalInputParsing,
  temporalWallClockWindow,
  toNaiveWallClockLiteral,
  toZonedDayStartIso,
} from "../src/datetime"

describe("datetime utilities", () => {
  const VN = "Asia/Ho_Chi_Minh"
  const NY = "America/New_York"

  test("resolves invalid timezones to UTC", () => {
    expect(resolveFilterTimezone(undefined)).toBe(DEFAULT_FILTER_TIMEZONE)
    expect(resolveFilterTimezone("not-a-zone")).toBe(DEFAULT_FILTER_TIMEZONE)
  })

  test("detects explicit offsets", () => {
    expect(hasExplicitOffset("2026-07-22T08:30:00.000Z")).toBe(true)
    expect(hasExplicitOffset("2026-07-22T08:30:00+07:00")).toBe(true)
    expect(hasExplicitOffset("2026-07-22 08:30:00")).toBe(false)
  })

  test("converts naive datetime values to UTC in the source timezone", () => {
    expect(filterValueToUtcIso("2026-07-22 15:30", VN)).toBe(
      "2026-07-22T08:30:00.000Z",
    )
  })

  test("passes through explicit UTC instants unchanged", () => {
    expect(filterValueToUtcIso("2026-07-22T08:30:00.000Z", VN)).toBe(
      "2026-07-22T08:30:00.000Z",
    )
  })

  test("normalizes temporal custom-field values through the handler registry", () => {
    expect(normalizeTemporalCustomFieldValue("date", "2026-07-22", VN)).toBe(
      "2026-07-22T00:00:00+07:00",
    )
    expect(
      normalizeTemporalCustomFieldValue("datetime", "2026-07-22 15:30", VN),
    ).toBe("2026-07-22T08:30:00.000Z")
    expect(
      normalizeTemporalCustomFieldValue(
        "datetime",
        "2026-07-22T15:30:00+07:00",
        NY,
      ),
    ).toBe("2026-07-22T08:30:00.000Z")
  })

  test("returns null for invalid temporal custom-field values", () => {
    expect(
      normalizeTemporalCustomFieldValue("date", "not-a-date", VN),
    ).toBeNull()
    expect(
      normalizeTemporalCustomFieldValue("datetime", "2026-07-22", VN),
    ).toBeNull()
  })

  test.each([
    "2026-02-30",
    "2026-02-29",
    "2026-04-31",
    "2026-00-10",
  ])("recognizes real calendar dates and rejects impossible one %s", (value) => {
    expect(isRealCalendarDate(value)).toBe(false)
  })

  test.each([
    "2026-07-22",
    "2024-02-29",
  ])("accepts real calendar date %s", (value) => {
    expect(isRealCalendarDate(value)).toBe(true)
  })

  test("returns null instead of throwing for impossible calendar dates", () => {
    // 2026-02-30 passes a naive Date.parse (rolls to March) but fromZonedTime
    // would throw; the strict gate must short-circuit to null.
    expect(
      normalizeTemporalCustomFieldValue("date", "2026-02-30", VN),
    ).toBeNull()
    expect(
      normalizeTemporalCustomFieldValue("datetime", "2026-02-30 10:00", VN),
    ).toBeNull()
  })

  test("degrades to the raw string when formatting a corrupt stored value", () => {
    // A legacy-garbage value the migration skipped must not crash the export or
    // variable render around it.
    expect(
      formatCustomFieldValueInTimeZone("datetime", "not-a-timestamp", VN),
    ).toBe("not-a-timestamp")
  })

  test("converts date values to the start of the calendar day in the source timezone", () => {
    expect(filterValueToUtcDayStartIso("2026-07-22", VN)).toBe(
      "2026-07-21T17:00:00.000Z",
    )
  })

  test("converts day end values across DST boundaries", () => {
    expect(filterValueToUtcDayEndIso("2026-07-01", NY)).toBe(
      "2026-07-02T04:00:00.000Z",
    )
    expect(filterValueToUtcDayEndIso("2026-01-01", NY)).toBe(
      "2026-01-02T05:00:00.000Z",
    )
  })

  test.each([
    ["2026-07-22", "day"],
    ["2026-07-22 09:30", "minute"],
    ["2026-07-22T09:30Z", "minute"],
    ["2026-07-22 09:30:45", "second"],
    ["2026-07-22T09:30:45+07:00", "second"],
  ])("detects the typed precision of %s as %s", (value, precision) => {
    expect(detectTemporalPrecision(value)).toBe(precision)
  })

  test.each([
    // Precision follows what the user typed; the window spans exactly one unit.
    ["2026-07-22", "2026-07-22T00:00:00", "2026-07-23T00:00:00"],
    ["2026-07-22 09:30", "2026-07-22T09:30:00", "2026-07-22T09:31:00"],
    ["2026-07-22 09:30:45", "2026-07-22T09:30:45", "2026-07-22T09:30:46"],
    // Rollovers stay correct at unit boundaries.
    ["2026-07-22 23:59", "2026-07-22T23:59:00", "2026-07-23T00:00:00"],
    ["2026-07-22 09:59:59", "2026-07-22T09:59:59", "2026-07-22T10:00:00"],
  ])("builds a naive wall-clock window for %s", (value, start, end) => {
    expect(temporalWallClockWindow(value)).toEqual({ start, end })
  })

  test("floors sub-precision digits out of the wall-clock window", () => {
    // A fractional second is floored to the whole second it falls in.
    expect(temporalWallClockWindow("2026-07-22T09:30:45.750Z")).toEqual({
      start: "2026-07-22T09:30:45",
      end: "2026-07-22T09:30:46",
    })
  })

  test("anchors an instant window to the criteria timezone", () => {
    // 09:30 VN (UTC+7) is 02:30Z; the minute window ends one minute later.
    expect(filterValueToUtcInstantWindow("2026-07-22 09:30", VN)).toEqual({
      startIso: "2026-07-22T02:30:00.000Z",
      endIso: "2026-07-22T02:31:00.000Z",
    })
  })

  test("spans the full day in an instant window for a date-only value", () => {
    expect(filterValueToUtcInstantWindow("2026-07-22", VN)).toEqual({
      startIso: "2026-07-21T17:00:00.000Z",
      endIso: "2026-07-22T17:00:00.000Z",
    })
  })

  test("honors an explicit offset over the criteria timezone in an instant window", () => {
    // The user typed +07:00, so NY is ignored: 09:30+07:00 is 02:30Z.
    expect(
      filterValueToUtcInstantWindow("2026-07-22T09:30:00+07:00", NY),
    ).toEqual({
      startIso: "2026-07-22T02:30:00.000Z",
      endIso: "2026-07-22T02:30:01.000Z",
    })
  })

  test("keeps an instant day window DST-safe across a fall-back boundary", () => {
    // Nov 1 2026 is a US DST fall-back day; the day still ends at local midnight.
    expect(filterValueToUtcInstantWindow("2026-11-01", NY)).toEqual({
      startIso: "2026-11-01T04:00:00.000Z",
      endIso: "2026-11-02T05:00:00.000Z",
    })
  })

  test("formats temporal custom-field values in a target timezone", () => {
    expect(
      formatCustomFieldValueInTimeZone("date", "2026-07-22T00:00:00+07:00", VN),
    ).toBe("2026-07-22")
    expect(
      formatCustomFieldValueInTimeZone(
        "datetime",
        "2026-07-22T08:30:00.000Z",
        VN,
      ),
    ).toBe("2026-07-22 15:30:00")
  })

  test("returns non-temporal values unchanged", () => {
    expect(formatCustomFieldValueInTimeZone("shortText", "hello", VN)).toBe(
      "hello",
    )
  })

  test("normalizes a date value to an offset-preserved start of day", () => {
    expect(toZonedDayStartIso("2026-07-22", VN)).toBe(
      "2026-07-22T00:00:00+07:00",
    )
    expect(datePartOf("2026-07-22T09:30:00+07:00")).toBe("2026-07-22")
    expect(hasTimeComponent("2026-07-22")).toBe(false)
    expect(hasTimeComponent("2026-07-22 09:30")).toBe(true)
  })

  test("strips any offset to a naive wall-clock literal", () => {
    // Date custom-field filters compare wall clock to wall clock; the offset a
    // stored value carries (or a user typed) must be dropped so no zone shift
    // leaks into the comparison.
    expect(toNaiveWallClockLiteral("2026-07-20")).toBe("2026-07-20T00:00:00")
    expect(toNaiveWallClockLiteral("2026-07-20 09:30")).toBe("2026-07-20T09:30")
    expect(toNaiveWallClockLiteral("2026-07-20T09:30:00+07:00")).toBe(
      "2026-07-20T09:30:00",
    )
    expect(toNaiveWallClockLiteral("2026-07-20T09:30:00.000Z")).toBe(
      "2026-07-20T09:30:00.000",
    )
  })

  test("resolves temporal picker serialization by type", () => {
    expect(resolveTemporalCustomFieldSaveFormat("date")).toBe("formatted")
    expect(resolveTemporalCustomFieldSaveFormat("datetime")).toBe("iso")
    expect(
      resolveTemporalCustomFieldFormValue("date", "2026-07-22T00:00:00+07:00"),
    ).toBe("2026-07-22")
    expect(
      resolveTemporalCustomFieldFormValue(
        "datetime",
        "2026-07-22T08:30:00.000Z",
      ),
    ).toBe("2026-07-22T08:30:00.000Z")
  })
})

// These vectors are the JS oracle the legacy-backfill migration SQL is checked
// against (drizzle/20260722102122_backfill_custom_field_datetime_utc). The SQL
// cannot be unit-tested in CI, so pinning the exact expected UTC output for the
// same inputs here catches any future drift between the SQL double-AT-TIME-ZONE
// transform and this engine. Covers VN plus NY summer (EDT -4) / winter (EST -5)
// and the spring-forward day where midnight is still pre-transition.
describe("legacy backfill migration oracle", () => {
  const VN = "Asia/Ho_Chi_Minh"
  const NY = "America/New_York"

  test.each([
    // [tz, naive datetime, expected UTC ISO]
    [VN, "2026-07-22 10:00", "2026-07-22T03:00:00.000Z"],
    [NY, "2026-07-15 12:00", "2026-07-15T16:00:00.000Z"], // EDT (-4)
    [NY, "2026-01-15 12:00", "2026-01-15T17:00:00.000Z"], // EST (-5)
  ])("datetime backfill: %s %s -> %s", (tz, value, expected) => {
    expect(filterValueToUtcIso(value, tz)).toBe(expected)
  })

  test.each([
    // [tz, naive date, expected offset-preserved start-of-day ISO]
    [VN, "2026-07-22", "2026-07-22T00:00:00+07:00"],
    [NY, "2026-07-15", "2026-07-15T00:00:00-04:00"], // EDT (-4)
    [NY, "2026-01-15", "2026-01-15T00:00:00-05:00"], // EST (-5)
    [NY, "2026-03-08", "2026-03-08T00:00:00-05:00"], // spring-forward day, 00:00 still EST
  ])("date backfill (start of day): %s %s -> %s", (tz, value, expected) => {
    expect(toZonedDayStartIso(value, tz)).toBe(expected)
  })
})

describe("temporal write-path enums", () => {
  test("parsing-mode values are stable", () => {
    expect(TemporalInputParsing.Strict).toBe("strict")
    expect(TemporalInputParsing.Lenient).toBe("lenient")
  })

  test("source-timezone strategy values are stable", () => {
    expect(SourceTimezoneStrategy.ContactThenWorkspace).toBe(
      "contactThenWorkspace",
    )
    expect(SourceTimezoneStrategy.Workspace).toBe("workspace")
  })
})

describe("currentTemporalLiteral", () => {
  const VN = "Asia/Ho_Chi_Minh" // UTC+7, no DST
  const NY = "America/New_York" // UTC-4 in July (EDT)
  // A fixed instant late enough in UTC that VN has already rolled to the next
  // calendar day — this is what makes the cross-midnight case meaningful.
  const NOW = new Date("2026-07-22T18:30:00Z")

  test("renders a date as today's calendar day in the given zone", () => {
    expect(currentTemporalLiteral("date", NY, NOW)).toBe("2026-07-22")
  })

  test("renders a datetime as the wall clock in the given zone", () => {
    expect(currentTemporalLiteral("datetime", NY, NOW)).toBe(
      "2026-07-22 14:30:00",
    )
  })

  test("crosses midnight into the next day for an ahead-of-UTC zone", () => {
    // 18:30Z is already 01:30 on the 23rd in UTC+7.
    expect(currentTemporalLiteral("date", VN, NOW)).toBe("2026-07-23")
    expect(currentTemporalLiteral("datetime", VN, NOW)).toBe(
      "2026-07-23 01:30:00",
    )
  })

  test("falls back to UTC for a blank or unrecognized zone", () => {
    expect(currentTemporalLiteral("date", undefined, NOW)).toBe("2026-07-22")
    expect(currentTemporalLiteral("datetime", "not-a-zone", NOW)).toBe(
      "2026-07-22 18:30:00",
    )
  })
})
