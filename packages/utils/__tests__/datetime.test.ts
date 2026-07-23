import { describe, expect, test } from "vitest"
import {
  DEFAULT_FILTER_TIMEZONE,
  datePartOf,
  filterValueToUtcDayEndIso,
  filterValueToUtcDayStartIso,
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
