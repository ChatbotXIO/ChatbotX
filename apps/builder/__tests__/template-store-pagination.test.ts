import { describe, expect, test } from "vitest"
import { clampPageIndex } from "../src/features/template-store/lib/clamp-page-index"

describe("clampPageIndex", () => {
  test.each([
    // [pageIndex, pageCount, expected]
    [0, 3, 0],
    [2, 3, 2],
    // The only row of the last page was removed: step back one page.
    [1, 1, 0],
    // A stale `?page=` far past the end lands on the last page.
    [40, 5, 4],
    // An empty table stays on the first page.
    [3, 0, 0],
  ])("page %i of %i shows %i", (pageIndex, pageCount, expected) => {
    expect(clampPageIndex(pageIndex, pageCount)).toBe(expected)
  })
})
