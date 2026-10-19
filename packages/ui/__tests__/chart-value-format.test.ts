// @vitest-environment node
import { describe, expect, test } from "vitest"
import { formatChartValue } from "../src/components/ui/chart"

describe("formatChartValue", () => {
  test("uses the given locale's decimal separator", () => {
    expect(formatChartValue(17.5, "en")).toBe("17.5")
    expect(formatChartValue(17.5, "vi")).toBe("17,5")
  })

  test("keeps integer display and groups thousands per locale", () => {
    expect(formatChartValue(42, "en")).toBe("42")
    expect(formatChartValue(1234, "en")).toBe("1,234")
  })

  test("renders non-numbers as text", () => {
    expect(formatChartValue("n/a", "en")).toBe("n/a")
  })
})

describe("formatChartValue with invalid locales", () => {
  test.each(["en_US", "", "xx-invalid-!!"])("never throws for %j", (locale) => {
    expect(() => formatChartValue(17.5, locale)).not.toThrow()
    expect(formatChartValue(1, locale)).toBe("1")
  })
})
