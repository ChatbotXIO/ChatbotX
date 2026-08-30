import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// resolveMessagingAdChannelAssets — the per-channel asset resolver. This suite
// pins the FAIL-FAST guards: a missing Page id (all channels), Instagram actor
// id (CTID), or WhatsApp phone number (CTWA) must throw BEFORE the create flow
// reaches Meta, so an incomplete integration never leaves an orphaned paused
// campaign behind (the campaign is created only AFTER assets resolve).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findMessenger: vi.fn(),
  findInstagram: vi.fn(),
  findWhatsapp: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: {
    findWorkspaceIntegration: mocks.findMessenger,
  },
  integrationInstagramRepository: {
    findWorkspaceIntegration: mocks.findInstagram,
  },
  integrationWhatsappRepository: {
    findByIdForWorkspace: mocks.findWhatsapp,
  },
}))

const { resolveMessagingAdChannelAssets } = await import(
  "../resolve-channel-assets"
)

const ref = { workspaceId: "ws_1", integrationId: "int_1" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("messenger", () => {
  test("resolves the page id", async () => {
    mocks.findMessenger.mockResolvedValue({ pageId: "pg_1" })
    const assets = await resolveMessagingAdChannelAssets({
      ...ref,
      channel: "messenger",
    })
    expect(assets).toEqual({ pageId: "pg_1" })
  })

  test("throws when the Page id is missing", async () => {
    mocks.findMessenger.mockResolvedValue({ pageId: "" })
    await expect(
      resolveMessagingAdChannelAssets({ ...ref, channel: "messenger" }),
    ).rejects.toThrow("Facebook Page")
  })
})

describe("instagram (CTID)", () => {
  test("resolves page id + instagram actor id", async () => {
    mocks.findInstagram.mockResolvedValue({ pageId: "pg_1", igId: "ig_1" })
    const assets = await resolveMessagingAdChannelAssets({
      ...ref,
      channel: "instagram",
    })
    expect(assets).toEqual({ pageId: "pg_1", instagramActorId: "ig_1" })
  })

  test("throws when the Instagram actor id is missing (would fail the CTID creative on Meta)", async () => {
    mocks.findInstagram.mockResolvedValue({ pageId: "pg_1", igId: "" })
    await expect(
      resolveMessagingAdChannelAssets({ ...ref, channel: "instagram" }),
    ).rejects.toThrow("Instagram professional account")
  })
})

describe("whatsapp (CTWA)", () => {
  test("resolves the linked page id + normalized phone number", async () => {
    mocks.findWhatsapp.mockResolvedValue({ displayPhoneNumber: "+84900000000" })
    mocks.findMessenger.mockResolvedValue({ pageId: "pg_1" })
    const assets = await resolveMessagingAdChannelAssets({
      ...ref,
      channel: "whatsapp",
      whatsappPageIntegrationId: "im_page",
    })
    expect(assets).toEqual({
      pageId: "pg_1",
      whatsappPhoneNumber: "84900000000",
    })
  })

  test("throws when the WhatsApp phone number is empty (before the campaign is created)", async () => {
    mocks.findWhatsapp.mockResolvedValue({ displayPhoneNumber: "" })
    mocks.findMessenger.mockResolvedValue({ pageId: "pg_1" })
    await expect(
      resolveMessagingAdChannelAssets({
        ...ref,
        channel: "whatsapp",
        whatsappPageIntegrationId: "im_page",
      }),
    ).rejects.toThrow("phone number")
  })
})
