import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByWorkspaceId: vi.fn(),
  findByWorkspaceIdMessenger: vi.fn(),
  findByWorkspaceIdInstagram: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: {
    listByWorkspaceId: mocks.listByWorkspaceId,
  },
  messengerIntegrationService: {
    findByWorkspaceId: mocks.findByWorkspaceIdMessenger,
  },
  instagramIntegrationService: {
    findByWorkspaceId: mocks.findByWorkspaceIdInstagram,
  },
}))

const { listMessagingAdsToolIntegrations } = await import(
  "@/features/ads-campaign/queries/tool-integrations"
)

describe("listMessagingAdsToolIntegrations — whatsapp", () => {
  test("labels an integration as 'name — phone' when a display phone number exists", async () => {
    mocks.listByWorkspaceId.mockResolvedValue([
      {
        id: "iw_1",
        name: "Support",
        displayPhoneNumber: "+1 555 0100",
        accessToken: "secret-token",
      },
    ])

    const result = await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "whatsapp",
    })

    expect(result).toEqual({
      integrations: [{ id: "iw_1", name: "Support — +1 555 0100" }],
      hasUnsupportedIntegrations: false,
    })
  })

  test("labels an integration with just the name when the phone number is empty", async () => {
    mocks.listByWorkspaceId.mockResolvedValue([
      { id: "iw_1", name: "Support", displayPhoneNumber: "" },
    ])

    const result = await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "whatsapp",
    })

    expect(result.integrations).toEqual([{ id: "iw_1", name: "Support" }])
  })

  test("labels an integration with just the name when the phone number is null", async () => {
    mocks.listByWorkspaceId.mockResolvedValue([
      { id: "iw_1", name: "Support", displayPhoneNumber: null },
    ])

    const result = await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "whatsapp",
    })

    expect(result.integrations).toEqual([{ id: "iw_1", name: "Support" }])
  })

  test("calls only the whatsapp service with the given workspaceId", async () => {
    mocks.listByWorkspaceId.mockResolvedValue([])

    await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "whatsapp",
    })

    expect(mocks.listByWorkspaceId).toHaveBeenCalledWith("ws_1")
    expect(mocks.findByWorkspaceIdMessenger).not.toHaveBeenCalled()
    expect(mocks.findByWorkspaceIdInstagram).not.toHaveBeenCalled()
  })
})

describe("listMessagingAdsToolIntegrations — messenger", () => {
  test("maps id and name only, dropping extra fields", async () => {
    mocks.findByWorkspaceIdMessenger.mockResolvedValue([
      { id: "im_1", name: "Page A", pageAccessToken: "secret" },
    ])

    const result = await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "messenger",
    })

    expect(result).toEqual({
      integrations: [{ id: "im_1", name: "Page A" }],
      hasUnsupportedIntegrations: false,
    })
  })

  test("calls only the messenger service with the given workspaceId", async () => {
    mocks.findByWorkspaceIdMessenger.mockResolvedValue([])

    await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "messenger",
    })

    expect(mocks.findByWorkspaceIdMessenger).toHaveBeenCalledWith("ws_1")
    expect(mocks.listByWorkspaceId).not.toHaveBeenCalled()
    expect(mocks.findByWorkspaceIdInstagram).not.toHaveBeenCalled()
  })
})

describe("listMessagingAdsToolIntegrations — instagram", () => {
  test("keeps facebook-type integrations and drops native-login ones, flagging unsupported", async () => {
    mocks.findByWorkspaceIdInstagram.mockResolvedValue([
      { id: "ii_1", name: "IG A", type: "facebook", token: "secret" },
      { id: "ii_2", name: "IG B", type: "native" },
    ])

    const result = await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "instagram",
    })

    expect(result).toEqual({
      integrations: [{ id: "ii_1", name: "IG A" }],
      hasUnsupportedIntegrations: true,
    })
  })

  test("reports no unsupported integrations when every row is facebook-type", async () => {
    mocks.findByWorkspaceIdInstagram.mockResolvedValue([
      { id: "ii_1", name: "IG A", type: "facebook" },
      { id: "ii_2", name: "IG B", type: "facebook" },
    ])

    const result = await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "instagram",
    })

    expect(result).toEqual({
      integrations: [
        { id: "ii_1", name: "IG A" },
        { id: "ii_2", name: "IG B" },
      ],
      hasUnsupportedIntegrations: false,
    })
  })

  test("returns an empty result with no unsupported flag when the workspace has no instagram integrations at all", async () => {
    mocks.findByWorkspaceIdInstagram.mockResolvedValue([])

    const result = await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "instagram",
    })

    expect(result).toEqual({
      integrations: [],
      hasUnsupportedIntegrations: false,
    })
  })

  test("returns an empty eligible list flagged unsupported when only native-login integrations exist", async () => {
    mocks.findByWorkspaceIdInstagram.mockResolvedValue([
      { id: "ii_1", name: "IG A", type: "native" },
    ])

    const result = await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "instagram",
    })

    expect(result).toEqual({
      integrations: [],
      hasUnsupportedIntegrations: true,
    })
  })

  test("calls only the instagram service with the given workspaceId", async () => {
    mocks.findByWorkspaceIdInstagram.mockResolvedValue([])

    await listMessagingAdsToolIntegrations({
      workspaceId: "ws_1",
      channel: "instagram",
    })

    expect(mocks.findByWorkspaceIdInstagram).toHaveBeenCalledWith("ws_1")
    expect(mocks.listByWorkspaceId).not.toHaveBeenCalled()
    expect(mocks.findByWorkspaceIdMessenger).not.toHaveBeenCalled()
  })
})
