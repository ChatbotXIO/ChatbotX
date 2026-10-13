import { beforeEach, describe, expect, test, vi } from "vitest"

const list = vi.hoisted(() => vi.fn())
vi.mock("@chatbotx.io/business", () => ({
  broadcastService: { list },
}))

import { listBroadcasts } from "@/features/broadcasts/queries"
import type { GetBroadcastsSchema } from "@/features/broadcasts/schema/query"

const sort: GetBroadcastsSchema["sort"] = [{ id: "createdAt", desc: true }]
const base = { workspaceId: "ws-1", page: 1, perPage: 10, name: null, sort }

describe("listBroadcasts", () => {
  beforeEach(() => {
    list.mockReset()
    list.mockResolvedValue({ data: [], pageCount: 0 })
  })

  test("never lists the runs a series spawns", async () => {
    await listBroadcasts({ ...base, status: null, kind: null })

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ includeRuns: false }),
    )
  })

  test("the unfiltered list keeps repeating broadcasts alongside one-offs", async () => {
    await listBroadcasts({ ...base, status: null, kind: null })

    const input = list.mock.calls[0]?.[0]
    expect(input.excludeTemplates).toBe(false)
    expect(input.schedulesType).toBeUndefined()
  })

  test("the Repeating filter lists series by schedule type", async () => {
    await listBroadcasts({ ...base, status: null, kind: "repeating" })

    const input = list.mock.calls[0]?.[0]
    expect(input.schedulesType).toBe("recurring")
    expect(input.excludeTemplates).toBe(false)
    expect(input).not.toHaveProperty("kind")
  })

  test.each([
    "cancelled",
    "sent",
  ] as const)("the %s filter leaves out series that only borrow that status", async (status) => {
    await listBroadcasts({ ...base, status, kind: null })

    expect(list.mock.calls[0]?.[0].excludeTemplates).toBe(true)
  })

  test.each([
    "draft",
    "scheduled",
    "sending",
    "failed",
  ] as const)("the %s filter keeps series, which can be drafts", async (status) => {
    await listBroadcasts({ ...base, status, kind: null })

    expect(list.mock.calls[0]?.[0].excludeTemplates).toBe(false)
  })

  test("Repeating wins over a status filter so a paused series is still listed", async () => {
    await listBroadcasts({ ...base, status: "cancelled", kind: "repeating" })

    const input = list.mock.calls[0]?.[0]
    expect(input.schedulesType).toBe("recurring")
    expect(input.excludeTemplates).toBe(false)
  })

  test("passes the page through untouched", async () => {
    const page = { data: [], pageCount: 3 }
    list.mockResolvedValue(page)

    await expect(
      listBroadcasts({ ...base, status: null, kind: null }),
    ).resolves.toBe(page)
  })
})
