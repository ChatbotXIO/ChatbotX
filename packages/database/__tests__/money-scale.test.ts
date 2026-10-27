import { describe, expect, test } from "vitest"
import { roundToMoneyScale } from "../src/partials/shared"

describe("roundToMoneyScale", () => {
  test.each([
    [1.123_45, 1.1235],
    [1.123_44, 1.1234],
    [-1.123_45, -1.1235],
    [0.1 + 0.2, 0.3],
    [1e-7, 0],
    [42, 42],
    // Decimal digits, not the float: 1.63914999… is below the half.
    [1.639_149_999_999_999_9, 1.6391],
    [1_000_000_000_000.0001, 1_000_000_000_000.0001],
    [0.999_95, 1],
    [-0.000_01, 0],
  ])("rounds %s like a numeric(19,4) column to %s", (input, expected) => {
    expect(roundToMoneyScale(input)).toBe(expected)
  })
})
