import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// messagingAdsConnectionService — the per-integration Facebook Ads
// connection backing the messaging-ads boxes (CTWA/CTM/CTID). Mocks the
// repository, encryption, and the cache-invalidation module at the module
// boundary so upsert/markInvalid/disconnect and workspace+integration
// scoping are asserted without touching a real DB or Redis.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findForIntegration: vi.fn(),
  create: vi.fn(),
  updateAuth: vi.fn(),
  updateStatus: vi.fn(),
  remove: vi.fn(),
  encryptObject: vi.fn(async (value: unknown) => ({ encrypted: value })),
  createId: vi.fn(() => "conn_generated"),
  invalidateMessagingAdsCache: vi.fn(),
  isDatabaseError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  messagingAdsConnectionRepository: {
    findForIntegration: mocks.findForIntegration,
    create: mocks.create,
    updateAuth: mocks.updateAuth,
    updateStatus: mocks.updateStatus,
    remove: mocks.remove,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  isDatabaseError: mocks.isDatabaseError,
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { encryptObject: mocks.encryptObject },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: mocks.createId }
})

vi.mock("../graph-cache", () => ({
  invalidateMessagingAdsCache: mocks.invalidateMessagingAdsCache,
}))

const { messagingAdsConnectionService } = await import("../service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createId.mockReturnValue("conn_generated")
  mocks.encryptObject.mockImplementation(async (value: unknown) => ({
    encrypted: value,
  }))
  mocks.isDatabaseError.mockReturnValue(false)
})

describe("findForIntegration", () => {
  test("resolves the matching integration FK for the given channel and scopes by workspaceId", async () => {
    mocks.findForIntegration.mockResolvedValue({ id: "conn_1" })

    const result = await messagingAdsConnectionService.findForIntegration({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
    })

    expect(result).toEqual({ id: "conn_1" })
    expect(mocks.findForIntegration).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      integrationWhatsappId: null,
      integrationMessengerId: "im_1",
      integrationInstagramId: null,
    })
  })
})

describe("upsertFromOAuth", () => {
  test("updates the existing connection's auth when one already exists (reconnect)", async () => {
    mocks.findForIntegration.mockResolvedValue({
      id: "conn_1",
      status: "invalid",
    })
    mocks.updateAuth.mockResolvedValue({ id: "conn_1", status: "active" })

    const result = await messagingAdsConnectionService.upsertFromOAuth({
      workspaceId: "ws_1",
      channel: "whatsapp",
      integrationId: "iw_1",
      auth: { accessToken: "new-token" } as never,
    })

    expect(result).toEqual({ id: "conn_1", status: "active" })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conn_1", workspaceId: "ws_1" }),
    )
    // A reconnect may attach a token with different ad-account access —
    // the cache for this connection must be invalidated either way.
    expect(mocks.invalidateMessagingAdsCache).toHaveBeenCalledWith(
      "whatsapp:iw_1",
    )
  })

  test("creates a new connection when none exists yet", async () => {
    mocks.findForIntegration.mockResolvedValue(null)
    mocks.create.mockResolvedValue({ id: "conn_generated", status: "active" })

    const result = await messagingAdsConnectionService.upsertFromOAuth({
      workspaceId: "ws_1",
      channel: "instagram",
      integrationId: "ii_1",
      auth: { accessToken: "token" } as never,
    })

    expect(result).toEqual({ id: "conn_generated", status: "active" })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn_generated",
        workspaceId: "ws_1",
        channel: "instagram",
        integrationInstagramId: "ii_1",
      }),
    )
  })

  test("falls back to an update when a concurrent connect wins the unique-index race", async () => {
    mocks.findForIntegration
      .mockResolvedValueOnce(null) // initial check: not found
      .mockResolvedValueOnce({ id: "conn_winner" }) // re-check after the race
    mocks.create.mockRejectedValue(
      Object.assign(new Error("duplicate"), {
        cause: {
          code: "23505",
          constraint: "MessagingAdsConnection_integrationWhatsappId_key",
        },
      }),
    )
    mocks.isDatabaseError.mockReturnValue(true)
    mocks.updateAuth.mockResolvedValue({ id: "conn_winner", status: "active" })

    const result = await messagingAdsConnectionService.upsertFromOAuth({
      workspaceId: "ws_1",
      channel: "whatsapp",
      integrationId: "iw_1",
      auth: { accessToken: "token" } as never,
    })

    expect(result).toEqual({ id: "conn_winner", status: "active" })
    expect(mocks.updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conn_winner" }),
    )
  })

  test("rethrows a create failure that is not the expected unique violation", async () => {
    mocks.findForIntegration.mockResolvedValue(null)
    const error = new Error("connection refused")
    mocks.create.mockRejectedValue(error)
    mocks.isDatabaseError.mockReturnValue(false)

    await expect(
      messagingAdsConnectionService.upsertFromOAuth({
        workspaceId: "ws_1",
        channel: "whatsapp",
        integrationId: "iw_1",
        auth: { accessToken: "token" } as never,
      }),
    ).rejects.toThrow("connection refused")
  })
})

describe("markInvalid", () => {
  test("flags the resolved integration's connection as invalid", async () => {
    await messagingAdsConnectionService.markInvalid({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
    })

    expect(mocks.updateStatus).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      integrationWhatsappId: null,
      integrationMessengerId: "im_1",
      integrationInstagramId: null,
      status: "invalid",
    })
  })
})

describe("disconnect", () => {
  test("is a no-op when there is no connection for the integration", async () => {
    mocks.findForIntegration.mockResolvedValue(null)

    await messagingAdsConnectionService.disconnect({
      workspaceId: "ws_1",
      channel: "whatsapp",
      integrationId: "iw_1",
    })

    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.invalidateMessagingAdsCache).not.toHaveBeenCalled()
  })

  test("removes the connection and invalidates its cache", async () => {
    mocks.findForIntegration.mockResolvedValue({ id: "conn_1" })

    await messagingAdsConnectionService.disconnect({
      workspaceId: "ws_1",
      channel: "whatsapp",
      integrationId: "iw_1",
    })

    expect(mocks.remove).toHaveBeenCalledWith({
      id: "conn_1",
      workspaceId: "ws_1",
    })
    expect(mocks.invalidateMessagingAdsCache).toHaveBeenCalledWith(
      "whatsapp:iw_1",
    )
  })
})
