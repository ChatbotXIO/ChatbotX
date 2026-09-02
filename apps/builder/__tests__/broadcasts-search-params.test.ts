import { describe, expect, test } from "vitest"
import { getBroadcastsSearchParamsCache } from "@/features/broadcasts/schema/query"

describe("getBroadcastsSearchParamsCache", () => {
  test("defaults status to null, view to table, range to month and date to null", () => {
    const parsed = getBroadcastsSearchParamsCache.parse({})
    expect(parsed.status).toBeNull()
    expect(parsed.view).toBe("table")
    expect(parsed.range).toBe("month")
    expect(parsed.date).toBeNull()
  })

  test("accepts known statuses, views, ranges and dates", () => {
    const parsed = getBroadcastsSearchParamsCache.parse({
      status: "failed",
      view: "calendar",
      range: "week",
      date: "2026-08-31",
    })
    expect(parsed.status).toBe("failed")
    expect(parsed.view).toBe("calendar")
    expect(parsed.range).toBe("week")
    expect(parsed.date).toBe("2026-08-31")
  })

  test("drops unknown status, view and range values", () => {
    const parsed = getBroadcastsSearchParamsCache.parse({
      status: "cancelled",
      view: "kanban",
      range: "year",
    })
    expect(parsed.status).toBeNull()
    expect(parsed.view).toBe("table")
    expect(parsed.range).toBe("month")
  })
})
