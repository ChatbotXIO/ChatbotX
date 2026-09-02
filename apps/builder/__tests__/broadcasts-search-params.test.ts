import { describe, expect, test } from "vitest"
import { getBroadcastsSearchParamsCache } from "@/features/broadcasts/schema/query"

describe("getBroadcastsSearchParamsCache", () => {
  test("defaults status to null, view to table, range to month and date to null", () => {
    const parsed = getBroadcastsSearchParamsCache.parse({})
    expect(parsed.status).toBeNull()
    expect(parsed.view).toBe("table")
    expect(parsed.range).toBe("month")
    expect(parsed.date).toBeNull()
    expect(parsed.endDate).toBeNull()
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

  test("accepts range custom and an endDate", () => {
    const parsed = getBroadcastsSearchParamsCache.parse({
      range: "custom",
      date: "2026-08-31",
      endDate: "2026-09-06",
    })
    expect(parsed.range).toBe("custom")
    expect(parsed.endDate).toBe("2026-09-06")
  })

  test("drops unknown status, view and range values", () => {
    const parsed = getBroadcastsSearchParamsCache.parse({
      status: "archived",
      view: "kanban",
      range: "year",
    })
    expect(parsed.status).toBeNull()
    expect(parsed.view).toBe("table")
    expect(parsed.range).toBe("month")
  })

  test("accepts the cancelled status filter", () => {
    const parsed = getBroadcastsSearchParamsCache.parse({
      status: "cancelled",
    })
    expect(parsed.status).toBe("cancelled")
  })
})
