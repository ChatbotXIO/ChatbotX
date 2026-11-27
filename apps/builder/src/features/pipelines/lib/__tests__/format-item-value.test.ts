import { describe, expect, test } from "vitest"
import { formatItemAge } from "../format-item-value"

const NOW = new Date("2026-10-26T12:00:00Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms)

describe("formatItemAge", () => {
  test.each([
    ["minutes", 5 * 60_000, "5"],
    ["hours", 3 * 3_600_000, "3"],
    ["days", 2 * 86_400_000, "2"],
    ["months", 95 * 86_400_000, "3"],
  ])("renders %s relative to now", (_unit, offset, digit) => {
    expect(formatItemAge(ago(offset), "en", NOW)).toContain(digit)
  })

  test("never goes negative for a future timestamp", () => {
    expect(
      formatItemAge(new Date(NOW.getTime() + 60_000), "en", NOW),
    ).toContain("0")
  })

  test("follows the locale", () => {
    expect(formatItemAge(ago(2 * 86_400_000), "vi", NOW)).not.toBe(
      formatItemAge(ago(2 * 86_400_000), "en", NOW),
    )
  })
})
