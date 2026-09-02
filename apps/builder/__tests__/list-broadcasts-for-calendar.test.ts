// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockListForCalendar, mockAssertAccess } = vi.hoisted(() => ({
  mockListForCalendar: vi.fn().mockResolvedValue([]),
  mockAssertAccess: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: { listForCalendar: mockListForCalendar },
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mockAssertAccess,
}))

const { listBroadcastsForCalendar } = await import(
  "../src/features/broadcasts/queries/list-broadcasts-for-calendar"
)

const baseInput = {
  workspaceId: "ws_1",
  status: null,
  name: null,
}

describe("listBroadcastsForCalendar", () => {
  beforeEach(() => {
    mockListForCalendar.mockClear()
    mockAssertAccess.mockClear()
  })

  test("queries the custom range's day boundaries as instants in the user's timezone", async () => {
    await listBroadcastsForCalendar({
      ...baseInput,
      range: "custom",
      date: "2026-09-02",
      endDate: "2026-09-08",
      timezone: "Asia/Ho_Chi_Minh",
    })

    expect(mockAssertAccess).toHaveBeenCalledWith("ws_1")
    const [call] = mockListForCalendar.mock.calls
    expect(call?.[0]?.from.toISOString()).toBe("2026-09-01T17:00:00.000Z")
    expect(call?.[0]?.to.toISOString()).toBe("2026-09-08T16:59:59.999Z")
  })

  test("falls back to UTC day boundaries for an unusable timezone", async () => {
    await listBroadcastsForCalendar({
      ...baseInput,
      range: "day",
      date: "2026-09-02",
      endDate: "2026-09-02",
      timezone: "Not/AZone",
    })

    const [call] = mockListForCalendar.mock.calls
    expect(call?.[0]?.from.toISOString()).toBe("2026-09-02T00:00:00.000Z")
    expect(call?.[0]?.to.toISOString()).toBe("2026-09-02T23:59:59.999Z")
  })

  test("forwards workspace, status and name filters unchanged", async () => {
    await listBroadcastsForCalendar({
      workspaceId: "ws_1",
      range: "day",
      date: "2026-09-02",
      endDate: "2026-09-02",
      status: "scheduled",
      name: "promo",
      timezone: "UTC",
    })

    expect(mockListForCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_1",
        status: "scheduled",
        name: "promo",
      }),
    )
  })

  test("omits undefined status and name so the service applies no filter", async () => {
    await listBroadcastsForCalendar({
      ...baseInput,
      range: "day",
      date: "2026-09-02",
      endDate: "2026-09-02",
      timezone: "UTC",
    })

    const [call] = mockListForCalendar.mock.calls
    expect(call?.[0]?.status).toBeUndefined()
    expect(call?.[0]?.name).toBeUndefined()
  })
})
