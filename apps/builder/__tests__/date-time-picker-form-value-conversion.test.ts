import { describe, expect, test } from "vitest"
import {
  formatSelectionLabel,
  toSelectedValueIso,
} from "@/features/get-user-data-webview/lib/value-conversion"

describe("toSelectedValueIso", () => {
  test("returns null when no date is picked", () => {
    expect(toSelectedValueIso(undefined, "date")).toBeNull()
  })

  test("date mode converts the picked local calendar day to UTC midnight", () => {
    // A contact in GMT+7 picks August 21, 2026 — the picker component gives
    // us a local Date object for that calendar day (local midnight-ish, per
    // the vendored DateTimePicker). asIsoDate on the typed-reply path parses
    // a bare "2026-08-21" string as UTC midnight, so the webview path must
    // match that exactly or the stored day would shift backward for
    // contacts east of UTC.
    const pickedLocalDate = new Date(2026, 7, 21, 0, 0, 0) // Aug 21, 2026 local midnight

    const result = toSelectedValueIso(pickedLocalDate, "date")

    expect(result).toBe("2026-08-21T00:00:00.000Z")
  })

  test("date mode ignores any local time-of-day component and keeps the calendar day", () => {
    const pickedLocalDate = new Date(2026, 7, 21, 23, 45, 0)

    const result = toSelectedValueIso(pickedLocalDate, "date")

    expect(result).toBe("2026-08-21T00:00:00.000Z")
  })

  test("datetime mode keeps the picked local instant as-is (ISO instant conversion)", () => {
    const pickedLocalDate = new Date(2026, 7, 21, 14, 30, 0)

    const result = toSelectedValueIso(pickedLocalDate, "datetime")

    expect(result).toBe(pickedLocalDate.toISOString())
  })
})

describe("formatSelectionLabel", () => {
  test("date mode renders an uppercased locale date without time", () => {
    const label = formatSelectionLabel(
      new Date(2026, 7, 21, 14, 30),
      "date",
      "en",
    )
    expect(label).toBe("AUG 21, 2026")
  })

  test("datetime mode appends a 24h time", () => {
    const label = formatSelectionLabel(
      new Date(2026, 7, 21, 0, 7),
      "datetime",
      "en",
    )
    expect(label).toBe("AUG 21, 2026 00:07")
  })

  test("follows the workspace locale ordering", () => {
    const label = formatSelectionLabel(new Date(2026, 7, 21), "date", "vi")
    expect(label.toLowerCase()).toContain("thg")
    expect(label).toContain("21")
    expect(label).toContain("2026")
  })
})
