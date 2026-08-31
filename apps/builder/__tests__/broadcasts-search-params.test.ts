import { describe, expect, test } from "vitest"
import { getBroadcastsSearchParamsCache } from "@/features/broadcasts/schema/query"

describe("getBroadcastsSearchParamsCache", () => {
  test("defaults status to null and view to table", () => {
    const parsed = getBroadcastsSearchParamsCache.parse({})
    expect(parsed.status).toBeNull()
    expect(parsed.view).toBe("table")
    expect(parsed.month).toBeNull()
  })

  test("accepts known statuses and views", () => {
    const parsed = getBroadcastsSearchParamsCache.parse({
      status: "failed",
      view: "calendar",
      month: "2026-08",
    })
    expect(parsed.status).toBe("failed")
    expect(parsed.view).toBe("calendar")
    expect(parsed.month).toBe("2026-08")
  })

  test("drops unknown status and view values", () => {
    const parsed = getBroadcastsSearchParamsCache.parse({
      status: "cancelled",
      view: "kanban",
    })
    expect(parsed.status).toBeNull()
    expect(parsed.view).toBe("table")
  })
})
