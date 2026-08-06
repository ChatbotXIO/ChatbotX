import { describe, expect, test } from "vitest"
import {
  ceilToPurgeBoundary,
  nextScheduledDeletionAt,
  WORKSPACE_DELETION_GRACE_MS,
} from "../src/workspace/deletion-schedule"

describe("ceilToPurgeBoundary", () => {
  test.each([
    // Between boundaries → rounds up to the next :30 / :00 tick.
    { input: "2026-08-06T10:20:00Z", expected: "2026-08-06T10:30:00Z" },
    { input: "2026-08-06T10:31:00Z", expected: "2026-08-06T11:00:00Z" },
    { input: "2026-08-06T10:00:00.001Z", expected: "2026-08-06T10:30:00Z" },
  ])("rounds $input up to $expected", ({ input, expected }) => {
    expect(ceilToPurgeBoundary(new Date(input)).toISOString()).toBe(
      new Date(expected).toISOString(),
    )
  })

  test("keeps a timestamp already on a boundary unchanged", () => {
    const onBoundary = new Date("2026-08-06T10:30:00Z")
    expect(ceilToPurgeBoundary(onBoundary).getTime()).toBe(onBoundary.getTime())
  })

  test("result always lands on a 30-minute boundary", () => {
    const result = ceilToPurgeBoundary(new Date("2026-08-06T10:07:23.456Z"))
    expect(result.getUTCMinutes() % 30).toBe(0)
    expect(result.getUTCSeconds()).toBe(0)
    expect(result.getUTCMilliseconds()).toBe(0)
  })
})

describe("nextScheduledDeletionAt", () => {
  test("returns now + 24h grace, rounded up to the purge boundary", () => {
    const now = new Date("2026-08-06T10:20:00Z")
    const result = nextScheduledDeletionAt(now)

    // Grace lands on 2026-08-07T10:20:00Z, which rounds up to :30.
    expect(result.toISOString()).toBe(
      new Date("2026-08-07T10:30:00Z").toISOString(),
    )
  })

  test("keeps grace within a predictable one-day window (24h–24h30m)", () => {
    const now = new Date("2026-08-06T10:20:00Z")
    const result = nextScheduledDeletionAt(now)
    const graceMs = result.getTime() - now.getTime()

    expect(graceMs).toBeGreaterThanOrEqual(WORKSPACE_DELETION_GRACE_MS)
    expect(graceMs).toBeLessThanOrEqual(
      WORKSPACE_DELETION_GRACE_MS + 30 * 60 * 1000,
    )
  })
})
