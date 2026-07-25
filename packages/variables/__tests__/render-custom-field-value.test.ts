import { describe, expect, test } from "vitest"
import { renderCustomFieldValue } from "../src/utils"

describe("renderCustomFieldValue", () => {
  test("renders date values as the literal calendar day", () => {
    expect(
      renderCustomFieldValue(
        "date",
        "2026-07-22T00:00:00+07:00",
        "America/New_York",
      ),
    ).toBe("2026-07-22")
  })

  test("formats temporal values in the requested timezone", () => {
    expect(
      renderCustomFieldValue(
        "datetime",
        "2026-07-22T08:30:00.000Z",
        "Asia/Ho_Chi_Minh",
      ),
    ).toBe("2026-07-22 15:30:00")
  })

  test("leaves non-temporal values unchanged", () => {
    expect(
      renderCustomFieldValue("shortText", "hello", "Asia/Ho_Chi_Minh"),
    ).toBe("hello")
  })
})
