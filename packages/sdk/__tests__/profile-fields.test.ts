import { describe, expect, test } from "vitest"
import { normalizeGender, normalizeUtcOffset } from "../src/lib/shared"

describe("profile field normalization", () => {
  test.each([
    [7, "+07:00"],
    [-3.5, "-03:30"],
    [0, "+00:00"],
    [undefined, undefined],
    [Number.NaN, undefined],
  ])("normalizes UTC offset %s", (offset, expected) => {
    expect(normalizeUtcOffset(offset)).toBe(expected)
  })

  test.each([
    ["MALE", "male"],
    ["female", "female"],
    ["unknown", "unknown"],
    ["custom", undefined],
    [undefined, undefined],
  ])("normalizes gender %s", (gender, expected) => {
    expect(normalizeGender(gender)).toBe(expected)
  })
})
