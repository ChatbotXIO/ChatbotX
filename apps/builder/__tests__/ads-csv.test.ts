import { describe, expect, test } from "vitest"
import { escapeCsvCell } from "@/features/ads/lib/csv"

describe("escapeCsvCell", () => {
  test.each([
    "=SUM(1,1)",
    "+cmd",
    "-cmd",
    "@cmd",
    "\tcmd",
    "\rcmd",
  ])("prefixes formula-like CSV cells: %s", (value) => {
    expect(escapeCsvCell(value)).toBe(
      value.includes(",") || value.includes("\r")
        ? `"${`'${value}`.replaceAll('"', '""')}"`
        : `'${value}`,
    )
  })

  test("keeps existing quote escaping after formula neutralization", () => {
    expect(escapeCsvCell('="hello"')).toBe(`"'=""hello"""`)
  })
})
