import { describe, expect, test } from "vitest"
import {
  EXPORT_POLL_TIMEOUT_MS,
  isExportPollTimedOut,
} from "../src/features/contacts/lib/export-poll"

describe("isExportPollTimedOut", () => {
  const startedAt = 1_000_000
  const polledAt = (dataUpdatedAt: number, errorUpdatedAt = 0) => ({
    dataUpdatedAt,
    errorUpdatedAt,
  })

  test("is not timed out before the first poll lands", () => {
    expect(isExportPollTimedOut(startedAt, polledAt(0))).toBe(false)
  })

  test("is not timed out while the last poll is within the window", () => {
    expect(
      isExportPollTimedOut(
        startedAt,
        polledAt(startedAt + EXPORT_POLL_TIMEOUT_MS - 1),
      ),
    ).toBe(false)
  })

  test("times out once the last poll is the full window after the start", () => {
    expect(
      isExportPollTimedOut(
        startedAt,
        polledAt(startedAt + EXPORT_POLL_TIMEOUT_MS),
      ),
    ).toBe(true)
  })

  test("times out when every poll fails, counting the last error", () => {
    expect(
      isExportPollTimedOut(
        startedAt,
        polledAt(0, startedAt + EXPORT_POLL_TIMEOUT_MS),
      ),
    ).toBe(true)
  })
})
