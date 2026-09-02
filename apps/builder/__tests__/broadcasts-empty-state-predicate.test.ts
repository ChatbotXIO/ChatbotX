import { describe, expect, test } from "vitest"
import { shouldShowBroadcastsEmptyState } from "@/features/broadcasts/utils/empty-state"

describe("shouldShowBroadcastsEmptyState", () => {
  test("returns true when there are no rows and no pages at all", () => {
    expect(shouldShowBroadcastsEmptyState({ rowCount: 0, pageCount: 0 })).toBe(
      true,
    )
  })

  test("returns false when the current page has no rows but other pages exist", () => {
    expect(shouldShowBroadcastsEmptyState({ rowCount: 0, pageCount: 3 })).toBe(
      false,
    )
  })

  test("returns false when rows are present", () => {
    expect(shouldShowBroadcastsEmptyState({ rowCount: 5, pageCount: 1 })).toBe(
      false,
    )
  })
})
