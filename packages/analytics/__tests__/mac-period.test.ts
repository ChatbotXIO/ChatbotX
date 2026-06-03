import { describe, expect, test } from "vitest"
import {
  anchoredPeriod,
  calcEndOfDayTtl,
  truncateHourInTimezone,
  workspaceMacCacheKey,
} from "../src/lib/mac-period"

const iso = (d: Date) => d.toISOString()

describe("anchoredPeriod", () => {
  test("event in the creation month returns period 0 anchored at createdAt", () => {
    const createdAt = new Date("2026-01-15T12:30:45.000Z")
    const { start, end } = anchoredPeriod(
      new Date("2026-01-20T08:00:00.000Z"),
      createdAt,
    )
    // seconds truncated to the minute
    expect(iso(start)).toBe("2026-01-15T12:30:00.000Z")
    expect(iso(end)).toBe("2026-02-15T12:30:00.000Z")
  })

  test("event before the anchor day still falls in the previous period", () => {
    const createdAt = new Date("2026-01-15T12:30:00.000Z")
    const { start, end } = anchoredPeriod(
      new Date("2026-02-10T00:00:00.000Z"),
      createdAt,
    )
    expect(iso(start)).toBe("2026-01-15T12:30:00.000Z")
    expect(iso(end)).toBe("2026-02-15T12:30:00.000Z")
  })

  test("clamps the day for short months (Jan 31 -> Feb 28)", () => {
    const createdAt = new Date("2026-01-31T12:30:00.000Z")
    // Feb 5 is still inside period 0: Jan 31 -> Feb 28
    const { start, end } = anchoredPeriod(
      new Date("2026-02-05T00:00:00.000Z"),
      createdAt,
    )
    expect(iso(start)).toBe("2026-01-31T12:30:00.000Z")
    expect(iso(end)).toBe("2026-02-28T12:30:00.000Z")
  })

  test("next period after a clamped boundary anchors back to the 31st", () => {
    const createdAt = new Date("2026-01-31T12:30:00.000Z")
    // Mar 1 is in period 1: Feb 28 -> Mar 31
    const { start, end } = anchoredPeriod(
      new Date("2026-03-01T00:00:00.000Z"),
      createdAt,
    )
    expect(iso(start)).toBe("2026-02-28T12:30:00.000Z")
    expect(iso(end)).toBe("2026-03-31T12:30:00.000Z")
  })

  test("event exactly on a period boundary belongs to the next period", () => {
    const createdAt = new Date("2026-01-31T12:30:00.000Z")
    const { start, end } = anchoredPeriod(
      new Date("2026-03-31T12:30:00.000Z"),
      createdAt,
    )
    expect(iso(start)).toBe("2026-03-31T12:30:00.000Z")
    expect(iso(end)).toBe("2026-04-30T12:30:00.000Z")
  })

  test("handles leap-year February (created Jan 31 2024)", () => {
    const createdAt = new Date("2024-01-31T00:00:00.000Z")
    const { start, end } = anchoredPeriod(
      new Date("2024-02-15T00:00:00.000Z"),
      createdAt,
    )
    expect(iso(start)).toBe("2024-01-31T00:00:00.000Z")
    expect(iso(end)).toBe("2024-02-29T00:00:00.000Z")
  })

  test("periods are stable across year boundaries", () => {
    const createdAt = new Date("2025-12-20T09:00:00.000Z")
    const { start, end } = anchoredPeriod(
      new Date("2026-01-10T00:00:00.000Z"),
      createdAt,
    )
    expect(iso(start)).toBe("2025-12-20T09:00:00.000Z")
    expect(iso(end)).toBe("2026-01-20T09:00:00.000Z")
  })

  test("an event many months ahead skips forward to the right period", () => {
    const createdAt = new Date("2026-01-10T09:00:00.000Z")
    // ~7 months later — period 7: Aug 10 -> Sep 10.
    const { start, end } = anchoredPeriod(
      new Date("2026-08-25T00:00:00.000Z"),
      createdAt,
    )
    expect(iso(start)).toBe("2026-08-10T09:00:00.000Z")
    expect(iso(end)).toBe("2026-09-10T09:00:00.000Z")
  })

  test("the period window is half-open: start is inclusive", () => {
    const createdAt = new Date("2026-01-10T09:00:00.000Z")
    // Event exactly on the anchor — belongs to period 0, not period -1.
    const { start, end } = anchoredPeriod(createdAt, createdAt)
    expect(iso(start)).toBe("2026-01-10T09:00:00.000Z")
    expect(iso(end)).toBe("2026-02-10T09:00:00.000Z")
  })
})

describe("truncateHourInTimezone", () => {
  test("drops minutes and seconds to the start of the UTC hour", () => {
    const truncated = truncateHourInTimezone(
      new Date("2026-05-01T10:47:23.500Z"),
      "UTC",
    )
    expect(truncated.toISOString()).toBe("2026-05-01T10:00:00.000Z")
  })
})

describe("calcEndOfDayTtl", () => {
  test("returns a positive second count not exceeding a full day", () => {
    const ttl = calcEndOfDayTtl("UTC")
    expect(ttl).toBeGreaterThanOrEqual(60)
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60)
  })
})

describe("cache key builders", () => {
  test("workspaceMacCacheKey namespaces by workspace id", () => {
    expect(workspaceMacCacheKey("ws-1")).toBe("mac:count:ws:ws-1")
  })
})
