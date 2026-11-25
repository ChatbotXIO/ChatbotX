import { describe, expect, test } from "vitest"
import { isValidPostgresTimestampWithOffset } from "../src/postgres-timestamp"

describe("isValidPostgresTimestampWithOffset", () => {
  test.each([
    "2026-11-22 14:04:24.123456+00",
    "2026-11-22T14:04:24Z",
    "2026-02-28T23:59:59.123456+07:00",
    "2028-02-29 00:00:00+0530",
  ])("accepts %s", (value) => {
    expect(isValidPostgresTimestampWithOffset(value)).toBe(true)
  })

  test.each([
    "",
    "not-a-time",
    "2026-11-22",
    "2026-13-45 10:00:00+00",
    "2026-02-30 10:00:00+00",
    "2027-02-29 10:00:00+00",
    "2026-11-22 24:00:00+00",
    "2026-11-22 10:60:00+00",
    "2026-11-22 10:00:00+24",
    "2026-11-22 10:00:00",
  ])("rejects %j", (value) => {
    expect(isValidPostgresTimestampWithOffset(value)).toBe(false)
  })
})
