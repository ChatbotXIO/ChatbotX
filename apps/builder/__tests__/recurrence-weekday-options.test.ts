import { describe, expect, test } from "vitest"
import { buildWeekdayOptions } from "@/components/recurrence/weekday-options"

describe("buildWeekdayOptions", () => {
  test.each([
    "en-US",
    "en-GB",
    "vi",
    "de",
    "ar",
  ])("%s lists Monday first and Sunday last, numbered Sunday 0", (locale) => {
    const options = buildWeekdayOptions(locale)
    expect(options.map((option) => option.value)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  test("names the days in full for assistive tech", () => {
    expect(
      buildWeekdayOptions("en-US").map((option) => option.ariaLabel),
    ).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ])
  })

  test("gives a short visible label", () => {
    const [first] = buildWeekdayOptions("en-US")
    expect(first?.label).toBe("Mon")
  })

  test("localizes the names", () => {
    const options = buildWeekdayOptions("de")
    expect(options[0]?.ariaLabel).toBe("Montag")
  })
})
