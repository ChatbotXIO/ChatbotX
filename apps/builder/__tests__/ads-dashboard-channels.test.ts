// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockDistinctConnectedChannels } = vi.hoisted(() => ({
  mockDistinctConnectedChannels: vi.fn(async () => [] as string[]),
}))

vi.mock("@chatbotx.io/business", () => ({
  inboxService: {
    distinctConnectedChannels: mockDistinctConnectedChannels,
  },
}))

const { resolveAdsDashboardChannels } = await import(
  "../src/features/analytics/lib/ads-dashboard-channels"
)

describe("resolveAdsDashboardChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns an empty array for a non-superAdmin without calling the business layer", async () => {
    const result = await resolveAdsDashboardChannels({
      workspaceId: "ws-1",
      isSuperAdmin: false,
    })

    expect(result).toEqual([])
    expect(mockDistinctConnectedChannels).not.toHaveBeenCalled()
  })

  test("returns only the connected ads-eligible channel when messenger is connected", async () => {
    mockDistinctConnectedChannels.mockResolvedValue(["messenger"])

    const result = await resolveAdsDashboardChannels({
      workspaceId: "ws-1",
      isSuperAdmin: true,
    })

    expect(result).toEqual(["messenger"])
    expect(mockDistinctConnectedChannels).toHaveBeenCalledWith("ws-1")
  })

  test("preserves the canonical eligible-channel order regardless of connection order", async () => {
    mockDistinctConnectedChannels.mockResolvedValue([
      "zalo",
      "messenger",
      "whatsapp",
    ])

    const result = await resolveAdsDashboardChannels({
      workspaceId: "ws-1",
      isSuperAdmin: true,
    })

    expect(result).toEqual(["whatsapp", "messenger"])
  })

  test("returns an empty array when no ads-eligible channel is connected", async () => {
    mockDistinctConnectedChannels.mockResolvedValue(["zalo", "telegram"])

    const result = await resolveAdsDashboardChannels({
      workspaceId: "ws-1",
      isSuperAdmin: true,
    })

    expect(result).toEqual([])
  })
})
