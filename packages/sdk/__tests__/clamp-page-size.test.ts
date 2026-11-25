import { describe, expect, test } from "vitest"
import { clampPageSize } from "../src/lib/util"

describe("clampPageSize", () => {
  test.each([
    [25, 100, 25],
    [100, 100, 100],
    [500, 100, 100],
    [1, 100, 1],
    [0, 100, 1],
    [-4, 100, 1],
    [2.9, 100, 2],
    [Number.POSITIVE_INFINITY, 100, 100],
  ])("limit %s with a maximum of %s is %s", (limit, max, expected) => {
    expect(clampPageSize(limit, max)).toBe(expected)
  })

  test("a NaN limit still yields a page size the platform accepts", () => {
    const size = clampPageSize(Number.NaN, 100)

    expect(size).toBeGreaterThanOrEqual(1)
    expect(size).toBeLessThanOrEqual(100)
  })
})
