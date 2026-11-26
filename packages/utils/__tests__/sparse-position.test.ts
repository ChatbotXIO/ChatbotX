import { describe, expect, it } from "vitest"
import {
  positionBetween,
  SPARSE_POSITION_STEP,
  spreadPositions,
} from "../src/sparse-position"

describe("positionBetween", () => {
  it("steps above the first item at the open top end", () => {
    expect(positionBetween(null, 10)).toBe(10 - SPARSE_POSITION_STEP)
  })

  it("steps below the last item at the open bottom end", () => {
    expect(positionBetween(10, null)).toBe(10 + SPARSE_POSITION_STEP)
  })

  it("returns 0 for an empty list", () => {
    expect(positionBetween(null, null)).toBe(0)
  })

  it("returns the midpoint of two neighbours", () => {
    expect(positionBetween(0, 1024)).toBe(512)
    expect(positionBetween(-3, -1)).toBe(-2)
  })

  it("does not overflow for huge finite neighbours", () => {
    const result = positionBetween(-Number.MAX_VALUE, Number.MAX_VALUE)
    expect(result).toBe(0)
  })

  it("returns null for equal neighbours", () => {
    expect(positionBetween(5, 5)).toBeNull()
  })

  it("returns null for inverted neighbours", () => {
    expect(positionBetween(6, 5)).toBeNull()
  })

  it("returns null once float precision is exhausted", () => {
    const lower = 1
    const upper = 1 + Number.EPSILON
    expect(positionBetween(lower, upper)).toBeNull()
  })

  it("returns null when an open end would overflow or lose the step", () => {
    expect(positionBetween(Number.MAX_VALUE, null)).toBeNull()
    expect(positionBetween(null, -Number.MAX_VALUE)).toBeNull()
    expect(positionBetween(1e300, null)).toBeNull()
  })

  it.each([
    [Number.NaN, 1],
    [1, Number.NaN],
    [Number.POSITIVE_INFINITY, null],
    [null, Number.NEGATIVE_INFINITY],
  ])("throws on non-finite input (%s, %s)", (before, after) => {
    expect(() => positionBetween(before, after)).toThrow(RangeError)
  })
})

describe("spreadPositions", () => {
  it("returns an empty list for a zero count", () => {
    expect(spreadPositions(0, 10, 0)).toEqual([])
    expect(spreadPositions(null, null, 0)).toEqual([])
  })

  it("spaces values evenly inside two bounds", () => {
    expect(spreadPositions(0, 40, 3)).toEqual([10, 20, 30])
  })

  it("spaces by the step above an open upper end", () => {
    expect(spreadPositions(100, null, 2)).toEqual([
      100 + SPARSE_POSITION_STEP,
      100 + 2 * SPARSE_POSITION_STEP,
    ])
  })

  it("spaces by the step below an open lower end", () => {
    expect(spreadPositions(null, 100, 2)).toEqual([
      100 - 2 * SPARSE_POSITION_STEP,
      100 - SPARSE_POSITION_STEP,
    ])
  })

  it("spaces by the step when both ends are open", () => {
    expect(spreadPositions(null, null, 3)).toEqual([
      0,
      SPARSE_POSITION_STEP,
      2 * SPARSE_POSITION_STEP,
    ])
  })

  it("returns strictly increasing values strictly inside the bounds", () => {
    const values = spreadPositions(-1, 1, 511)
    expect(values).toHaveLength(511)
    for (const [index, value] of (values ?? []).entries()) {
      expect(value).toBeGreaterThan(
        index === 0 ? -1 : (values ?? [])[index - 1],
      )
      expect(value).toBeLessThan(1)
    }
  })

  it("returns null when the values do not fit between the bounds", () => {
    expect(spreadPositions(1, 1, 1)).toBeNull()
    expect(spreadPositions(5, 1, 1)).toBeNull()
    expect(spreadPositions(1, 1 + Number.EPSILON, 4)).toBeNull()
  })

  it("returns null when an open end overflows", () => {
    expect(spreadPositions(Number.MAX_VALUE, null, 2)).toBeNull()
    expect(spreadPositions(null, -Number.MAX_VALUE, 2)).toBeNull()
  })

  it("throws on non-finite bounds", () => {
    expect(() => spreadPositions(Number.NaN, null, 1)).toThrow(RangeError)
    expect(() => spreadPositions(null, Number.POSITIVE_INFINITY, 1)).toThrow(
      RangeError,
    )
  })

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("throws on an invalid count (%s)", (count) => {
    expect(() => spreadPositions(0, 10, count)).toThrow(RangeError)
  })
})
