import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  findForIntegration: vi.fn(),
  invalidateMessagingAdsCache: vi.fn(),
  decryptObject: vi.fn(),
  disconnect: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  messagingAdsConnectionRepository: {
    findForIntegration: mocks.findForIntegration,
    remove: mocks.remove,
  },
}))

vi.mock("../src/messaging-ads-connection/graph-cache", () => ({
  invalidateMessagingAdsCache: mocks.invalidateMessagingAdsCache,
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: (value: unknown) => value },
  encryptUtils: {
    decryptObject: mocks.decryptObject,
    encryptObject: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  facebookAdsAuthSchema: {},
  integration: {
    disconnect: mocks.disconnect,
  },
}))

vi.mock("../src/logger", () => ({
  logger: { error: mocks.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { messagingAdsConnectionService } = await import(
  "../src/messaging-ads-connection/service"
)

describe("messagingAdsConnectionService.revokeAndDisconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("revokes the Graph token then deletes the row and invalidates its cache", async () => {
    mocks.findForIntegration.mockResolvedValue({
      id: "conn-1",
      auth: { encrypted: true },
    })
    mocks.decryptObject.mockResolvedValue({ accessToken: "token" })
    mocks.disconnect.mockResolvedValue(undefined)
    mocks.remove.mockResolvedValue(undefined)

    await messagingAdsConnectionService.revokeAndDisconnect({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "im-1",
    })

    expect(mocks.disconnect).toHaveBeenCalledWith({ accessToken: "token" })
    expect(mocks.remove).toHaveBeenCalledWith({
      id: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.invalidateMessagingAdsCache).toHaveBeenCalledWith(
      "ws-1:messenger:im-1",
    )
  })

  test("a revoke failure (expired/already-revoked token) never blocks the delete", async () => {
    mocks.findForIntegration.mockResolvedValue({
      id: "conn-1",
      auth: { encrypted: true },
    })
    mocks.decryptObject.mockRejectedValue(new Error("undecryptable auth"))
    mocks.remove.mockResolvedValue(undefined)

    await messagingAdsConnectionService.revokeAndDisconnect({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "im-1",
    })

    expect(mocks.error).toHaveBeenCalled()
    expect(mocks.remove).toHaveBeenCalledWith({
      id: "conn-1",
      workspaceId: "ws-1",
    })
  })

  test("no connection found -> skips revoke, deletes nothing, never throws", async () => {
    mocks.findForIntegration.mockResolvedValue(null)

    await expect(
      messagingAdsConnectionService.revokeAndDisconnect({
        workspaceId: "ws-1",
        channel: "messenger",
        integrationId: "im-1",
      }),
    ).resolves.toBeUndefined()

    expect(mocks.disconnect).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
