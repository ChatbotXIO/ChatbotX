import { describe, expect, test } from "vitest"
import { selectedRowIds } from "../src/features/template-store/lib/selected-row-ids"

describe("selectedRowIds", () => {
  test("keeps rows checked on other pages, which the page's rows do not hold", () => {
    // Row 1 was checked on page 1, row 11 on page 2 (the page on screen).
    expect(selectedRowIds({ "1": true, "11": true })).toEqual(["1", "11"])
  })

  test("leaves out rows that were unchecked", () => {
    expect(selectedRowIds({ "1": true, "2": false })).toEqual(["1"])
  })

  test("no selection gives no id", () => {
    expect(selectedRowIds({})).toEqual([])
  })
})
