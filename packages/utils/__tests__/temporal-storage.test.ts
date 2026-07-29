import { describe, expect, it } from "vitest"
import { TemporalInputParsing } from "../src/datetime"
import { normalizeTemporalValueForStorage } from "../src/temporal-input"

const ANCHOR = "Asia/Ho_Chi_Minh"

describe("normalizeTemporalValueForStorage", () => {
  describe("strict parsing (default)", () => {
    it("accepts canonical values", () => {
      expect(
        normalizeTemporalValueForStorage({
          type: "date",
          value: "2026-05-19",
          timezone: ANCHOR,
        }),
      ).toBe("2026-05-19T00:00:00+07:00")

      expect(
        normalizeTemporalValueForStorage({
          type: "datetime",
          value: "2026-05-19 23:30:00",
          timezone: ANCHOR,
        }),
      ).toBe("2026-05-19T16:30:00.000Z")
    })

    it("rejects non-canonical values instead of guessing", () => {
      expect(
        normalizeTemporalValueForStorage({
          type: "date",
          value: "19/05/2026",
          timezone: ANCHOR,
        }),
      ).toBeNull()
    })
  })

  describe("lenient parsing", () => {
    // The regression this whole module exists to prevent: a value the strict
    // normalizer understands must never be re-derived by the loose parser.
    it.each([
      ["2026-05-19T23:30:00-04:00", "2026-05-19T00:00:00+07:00"],
      ["2026-05-19T20:00:00Z", "2026-05-19T00:00:00+07:00"],
      ["2026-05-19 23:30:00", "2026-05-19T00:00:00+07:00"],
      ["2026-05-19", "2026-05-19T00:00:00+07:00"],
    ])("keeps the authored calendar day of date %s", (raw, expected) => {
      expect(
        normalizeTemporalValueForStorage({
          type: "date",
          value: raw,
          timezone: ANCHOR,
          parsing: TemporalInputParsing.Lenient,
        }),
      ).toBe(expected)
    })

    it("preserves milliseconds the loose parser would drop", () => {
      expect(
        normalizeTemporalValueForStorage({
          type: "datetime",
          value: "2026-05-19T23:30:00.123",
          timezone: ANCHOR,
          parsing: TemporalInputParsing.Lenient,
        }),
      ).toBe("2026-05-19T16:30:00.123Z")
    })

    it.each([
      ["19/05/2026", "2026-05-19T00:00:00+07:00"],
      ["1700000000", "2023-11-15T00:00:00+07:00"],
      ["ngày 19 tháng 5 năm 2026", "2026-05-19T00:00:00+07:00"],
    ])("falls back to the loose parser for date %s", (raw, expected) => {
      expect(
        normalizeTemporalValueForStorage({
          type: "date",
          value: raw,
          timezone: ANCHOR,
          parsing: TemporalInputParsing.Lenient,
        }),
      ).toBe(expected)
    })

    it("returns null for genuinely unparseable input", () => {
      expect(
        normalizeTemporalValueForStorage({
          type: "datetime",
          value: "not-a-date-at-all",
          timezone: ANCHOR,
          parsing: TemporalInputParsing.Lenient,
        }),
      ).toBeNull()
    })

    it("rejects a calendar date that does not exist", () => {
      expect(
        normalizeTemporalValueForStorage({
          type: "date",
          value: "2026-02-30",
          timezone: ANCHOR,
          parsing: TemporalInputParsing.Lenient,
        }),
      ).toBeNull()
    })
  })

  it("anchors to UTC when no usable timezone is supplied", () => {
    for (const timezone of [null, undefined, "Not/AZone"]) {
      expect(
        normalizeTemporalValueForStorage({
          type: "date",
          value: "19/05/2026",
          timezone,
          parsing: TemporalInputParsing.Lenient,
        }),
      ).toBe("2026-05-19T00:00:00Z")
    }
  })
})
