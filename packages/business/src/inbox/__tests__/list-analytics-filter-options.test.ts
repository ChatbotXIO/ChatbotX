import { beforeEach, describe, expect, test, vi } from "vitest"

// `inboxService.listAnalyticsFilterOptions` feeds the analytics Channel / Inbox
// filters (and the public `analytics.filterOptions`). It must be a thin
// pass-through to the repository's lean projection: workspace-scoped,
// connected inboxes only, no integration relations.
const mocks = vi.hoisted(() => ({
  listAnalyticsOptionsByWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  inboxRepository: {
    listAnalyticsOptionsByWorkspace: mocks.listAnalyticsOptionsByWorkspace,
  },
}))

const { inboxService } = await import("../service")

describe("inboxService.listAnalyticsFilterOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates to the repository with only the workspace", async () => {
    mocks.listAnalyticsOptionsByWorkspace.mockResolvedValue([])

    await inboxService.listAnalyticsFilterOptions("ws-1")

    expect(
      mocks.listAnalyticsOptionsByWorkspace,
    ).toHaveBeenCalledExactlyOnceWith({ workspaceId: "ws-1" })
  })

  test("returns every option unpaginated, as a lean projection", async () => {
    const options = Array.from({ length: 120 }, (_, index) => ({
      id: String(index + 1),
      name: `Inbox ${index + 1}`,
      channel: index % 2 === 0 ? "messenger" : "whatsapp",
    }))
    mocks.listAnalyticsOptionsByWorkspace.mockResolvedValue(options)

    const result = await inboxService.listAnalyticsFilterOptions("ws-1")

    expect(result).toHaveLength(120)
    expect(Object.keys(result[0] ?? {}).sort()).toEqual([
      "channel",
      "id",
      "name",
    ])
  })

  test("a repository failure is not swallowed", async () => {
    mocks.listAnalyticsOptionsByWorkspace.mockRejectedValue(
      new Error("db down"),
    )

    await expect(
      inboxService.listAnalyticsFilterOptions("ws-1"),
    ).rejects.toThrow("db down")
  })
})
