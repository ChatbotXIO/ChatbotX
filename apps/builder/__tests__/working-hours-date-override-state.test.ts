import { describe, expect, test } from "vitest"
import {
  addRange,
  canAddRange,
  emptyDraft,
  formatRanges,
  setClosed,
  validateRanges,
} from "@/features/working-hours/lib/date-override-state"

describe("date override state", () => {
  test("a new draft is a closed day", () => {
    expect(emptyDraft()).toEqual({
      date: "",
      name: "",
      closed: true,
      ranges: [],
    })
  })

  test("opening a closed day seeds 09:00-17:00; closing it drops the ranges", () => {
    const opened = setClosed(emptyDraft(), false)
    expect(opened.ranges).toEqual([{ startMinute: 540, endMinute: 1020 }])
    expect(setClosed(opened, true)).toMatchObject({ closed: true, ranges: [] })
  })

  test("adding a range starts at the last end and is capped at 24:00", () => {
    expect(addRange([{ startMinute: 540, endMinute: 600 }])).toEqual([
      { startMinute: 540, endMinute: 600 },
      { startMinute: 600, endMinute: 660 },
    ])
    expect(addRange([{ startMinute: 1000, endMinute: 1425 }]).at(-1)).toEqual({
      startMinute: 1425,
      endMinute: 1440,
    })
  })

  test("a range cannot be added after the day is full or at the per-day limit", () => {
    expect(canAddRange([{ startMinute: 0, endMinute: 1440 }])).toBe(false)
    expect(
      canAddRange(
        Array.from({ length: 10 }, (_, index) => ({
          startMinute: index * 60,
          endMinute: index * 60 + 30,
        })),
      ),
    ).toBe(false)
    expect(canAddRange([])).toBe(true)
  })

  test("validates order and overlap", () => {
    expect(validateRanges([{ startMinute: 600, endMinute: 600 }])).toBe("order")
    expect(
      validateRanges([
        { startMinute: 0, endMinute: 120 },
        { startMinute: 60, endMinute: 180 },
      ]),
    ).toBe("overlap")
    expect(validateRanges([{ startMinute: 0, endMinute: 60 }])).toBeUndefined()
  })

  test("formats sorted ranges, 24:00 included", () => {
    expect(
      formatRanges([
        { startMinute: 780, endMinute: 1440 },
        { startMinute: 540, endMinute: 720 },
      ]),
    ).toBe("09:00–12:00, 13:00–24:00")
  })
})
