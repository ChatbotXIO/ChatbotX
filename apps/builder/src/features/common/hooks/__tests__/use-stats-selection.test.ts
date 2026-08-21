import { describe, expect, test } from "vitest"
import {
  getHeaderCheckboxState,
  getSelectedCount,
  isContactSelected,
  type StatsSelection,
  toggleContactSelection,
  toggleHeaderSelection,
} from "../use-stats-selection"

describe("stats contact selection", () => {
  test("defaults to all contacts selected", () => {
    const selection: StatsSelection = { mode: "all", excludedIds: new Set() }

    expect(isContactSelected(selection, "contact-1")).toBe(true)
    expect(getSelectedCount(selection, 42)).toBe(42)
    expect(getHeaderCheckboxState(selection)).toEqual({
      checked: true,
      indeterminate: false,
    })
  })

  test("toggles a contact into exclusions in all mode", () => {
    const selection = toggleContactSelection(
      { mode: "all", excludedIds: new Set() },
      "contact-1",
    )

    expect(selection.mode).toBe("all")
    expect(isContactSelected(selection, "contact-1")).toBe(false)
    expect(getSelectedCount(selection, 10)).toBe(9)
    expect(getHeaderCheckboxState(selection)).toEqual({
      checked: false,
      indeterminate: true,
    })
  })

  test("header toggles fully selected all mode to empty manual mode", () => {
    const selection = toggleHeaderSelection({
      mode: "all",
      excludedIds: new Set(),
    })

    expect(selection).toEqual({ mode: "manual", includedIds: new Set() })
    expect(getSelectedCount(selection, 10)).toBe(0)
    expect(getHeaderCheckboxState(selection)).toEqual({
      checked: false,
      indeterminate: false,
    })
  })

  test("header toggles partial selection back to fully selected all mode", () => {
    const selection = toggleHeaderSelection({
      mode: "manual",
      includedIds: new Set(["contact-1"]),
    })

    expect(selection).toEqual({ mode: "all", excludedIds: new Set() })
    expect(getSelectedCount(selection, 10)).toBe(10)
    expect(getHeaderCheckboxState(selection)).toEqual({
      checked: true,
      indeterminate: false,
    })
  })

  test("manual mode tracks included contact ids", () => {
    const selection = toggleContactSelection(
      { mode: "manual", includedIds: new Set() },
      "contact-1",
    )

    expect(selection.mode).toBe("manual")
    expect(isContactSelected(selection, "contact-1")).toBe(true)
    expect(getSelectedCount(selection, 10)).toBe(1)
    expect(getHeaderCheckboxState(selection)).toEqual({
      checked: false,
      indeterminate: true,
    })
  })

  test("manual mode normalizes to all mode when every contact is selected", () => {
    const selection = toggleContactSelection(
      { mode: "manual", includedIds: new Set() },
      "contact-1",
      1,
    )

    expect(selection).toEqual({ mode: "all", excludedIds: new Set() })
    expect(getSelectedCount(selection, 1)).toBe(1)
    expect(getHeaderCheckboxState(selection, 1)).toEqual({
      checked: true,
      indeterminate: false,
    })
  })
})
