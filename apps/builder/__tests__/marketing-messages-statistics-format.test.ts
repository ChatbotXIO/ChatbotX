import { describe, expect, test } from "vitest"
import {
  formatStatCount,
  formatStatMoney,
  formatStatRate,
} from "@/features/facebook-marketing-messages/lib/statistics-format"

describe("statistics formatters", () => {
  test("null renders as a dash, 0 stays 0", () => {
    expect(formatStatCount(null, "en")).toBe("-")
    expect(formatStatRate(null, "en")).toBe("-")
    expect(formatStatMoney(null, "USD", "en")).toBe("-")
    expect(formatStatCount(0, "en")).toBe("0")
    expect(formatStatRate(0, "en")).toBe("0%")
  })

  test("counts are grouped integers", () => {
    expect(formatStatCount(1234, "en")).toBe("1,234")
  })

  test("rates round to at most 2 decimals with a percent sign", () => {
    expect(formatStatRate(24.766_355, "en")).toBe("24.77%")
    expect(formatStatRate(100, "en")).toBe("100%")
  })

  test("money uses the account currency and Meta's zero-decimal list", () => {
    expect(formatStatMoney(38.87, "USD", "en")).toBe("$38.87")
    const vnd = formatStatMoney(123_566, "VND", "vi")
    expect(vnd).toContain("123.566")
    expect(vnd).toContain("₫")
  })

  test("an unknown or missing currency still renders the number", () => {
    expect(formatStatMoney(12.5, null, "en")).toBe("12.5")
    expect(formatStatMoney(12.5, "XYZ1", "en")).toBe("12.5 XYZ1")
  })
})
