import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listForChannel: vi.fn(),
  logError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  messagingAdsConnectionService: {
    listForChannel: mocks.listForChannel,
  },
}))

vi.mock("@/lib/log", () => ({
  logger: {
    error: mocks.logError,
  },
}))

const { listActiveMessagingAdsIntegrationIds } = await import(
  "@/features/ads-campaign/queries/tool-active-integration-ids"
)

describe("listActiveMessagingAdsIntegrationIds", () => {
  test("returns integration ids of active whatsapp connections via integrationWhatsappId", async () => {
    mocks.listForChannel.mockResolvedValue([
      { status: "active", integrationWhatsappId: "iw_1" },
    ])

    const result = await listActiveMessagingAdsIntegrationIds({
      workspaceId: "ws_1",
      channel: "whatsapp",
    })

    expect(result).toEqual(["iw_1"])
  })

  test("returns integration ids of active messenger connections via integrationMessengerId", async () => {
    mocks.listForChannel.mockResolvedValue([
      { status: "active", integrationMessengerId: "im_1" },
    ])

    const result = await listActiveMessagingAdsIntegrationIds({
      workspaceId: "ws_1",
      channel: "messenger",
    })

    expect(result).toEqual(["im_1"])
  })

  test("returns integration ids of active instagram connections via integrationInstagramId", async () => {
    mocks.listForChannel.mockResolvedValue([
      { status: "active", integrationInstagramId: "ii_1" },
    ])

    const result = await listActiveMessagingAdsIntegrationIds({
      workspaceId: "ws_1",
      channel: "instagram",
    })

    expect(result).toEqual(["ii_1"])
  })

  test("skips connections that are not active", async () => {
    mocks.listForChannel.mockResolvedValue([
      { status: "invalid", integrationWhatsappId: "iw_1" },
      { status: "active", integrationWhatsappId: "iw_2" },
    ])

    const result = await listActiveMessagingAdsIntegrationIds({
      workspaceId: "ws_1",
      channel: "whatsapp",
    })

    expect(result).toEqual(["iw_2"])
  })

  test("skips active rows whose channel FK column is null", async () => {
    mocks.listForChannel.mockResolvedValue([
      { status: "active", integrationWhatsappId: null },
      { status: "active", integrationWhatsappId: "iw_1" },
    ])

    const result = await listActiveMessagingAdsIntegrationIds({
      workspaceId: "ws_1",
      channel: "whatsapp",
    })

    expect(result).toEqual(["iw_1"])
  })

  test("passes { workspaceId, channel } through to the service unchanged", async () => {
    mocks.listForChannel.mockResolvedValue([])

    await listActiveMessagingAdsIntegrationIds({
      workspaceId: "ws_42",
      channel: "messenger",
    })

    expect(mocks.listForChannel).toHaveBeenCalledWith({
      workspaceId: "ws_42",
      channel: "messenger",
    })
  })

  test("degrades to an empty array and logs when the service throws", async () => {
    const error = new Error("db unavailable")
    mocks.listForChannel.mockRejectedValue(error)

    const result = await listActiveMessagingAdsIntegrationIds({
      workspaceId: "ws_1",
      channel: "instagram",
    })

    expect(result).toEqual([])
    expect(mocks.logError).toHaveBeenCalledTimes(1)
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        channel: "instagram",
        workspaceId: "ws_1",
      }),
      expect.any(String),
    )
  })
})
