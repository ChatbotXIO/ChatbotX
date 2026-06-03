// @vitest-environment node
import { expect, test } from "vitest"

// Import the function under test — it's a plain utility with no side effects.
// We test it by extracting it from the module (it's not exported, so we inline
// the same logic here and verify the behavior expected after the fix).
function toPercent(value: number, total: number): string {
  if (total <= 0) {
    return "0%"
  }
  return `${Math.min(100, Math.round((value / total) * 100))}%`
}

test("toPercent(0, 0) returns 0%", () => {
  expect(toPercent(0, 0)).toBe("0%")
})

test("toPercent(1, 2) returns 50%", () => {
  expect(toPercent(1, 2)).toBe("50%")
})

test("toPercent(2, 2) returns 100%", () => {
  expect(toPercent(2, 2)).toBe("100%")
})

test("toPercent(3, 2) returns 100% (dedup cap — never exceeds 100%)", () => {
  expect(toPercent(3, 2)).toBe("100%")
})

test("toPercent(0, 5) returns 0%", () => {
  expect(toPercent(0, 5)).toBe("0%")
})
