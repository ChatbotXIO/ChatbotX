import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// buildMessagingAdsContext — resolves the per-integration Graph auth context.
// Deliberately does NOT go through `buildContext`'s `facebookAds` auth store
// (that targets the wrong table — v3 correction #4); this test asserts it
// resolves via `makeAuthStoreForTable` + `buildContextWithAuthStore` instead,
// and that a missing/inactive/undecodable connection throws the typed
// "reconnect needed" exception rather than a raw decrypt error.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findForIntegration: vi.fn(),
  markInvalid: vi.fn(),
  decryptObject: vi.fn(),
  makeAuthStoreForTable: vi.fn(() => ({ authStore: true })),
  buildContextWithAuthStore: vi.fn(async (args: unknown) => ({
    ctx: true,
    args,
  })),
}))

vi.mock("../service", () => ({
  messagingAdsConnectionService: {
    findForIntegration: mocks.findForIntegration,
    markInvalid: mocks.markInvalid,
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: (value: unknown) => value },
  encryptUtils: { decryptObject: mocks.decryptObject },
}))

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  facebookAdsAuthSchema: {},
}))

vi.mock("../../integration-context/auth-store", () => ({
  makeAuthStoreForTable: mocks.makeAuthStoreForTable,
}))

vi.mock("../../integration-context/build-context", () => ({
  buildContextWithAuthStore: mocks.buildContextWithAuthStore,
}))

const { buildMessagingAdsContext, MessagingAdsReconnectRequiredException } =
  await import("../context")

beforeEach(() => {
  vi.clearAllMocks()
})

const identity = {
  workspaceId: "ws_1",
  channel: "whatsapp" as const,
  integrationId: "iw_1",
}

describe("buildMessagingAdsContext", () => {
  test("throws MessagingAdsReconnectRequiredException when no connection exists", async () => {
    mocks.findForIntegration.mockResolvedValue(null)

    await expect(buildMessagingAdsContext(identity)).rejects.toBeInstanceOf(
      MessagingAdsReconnectRequiredException,
    )
    expect(mocks.decryptObject).not.toHaveBeenCalled()
  })

  test("throws MessagingAdsReconnectRequiredException when the connection is flagged invalid", async () => {
    mocks.findForIntegration.mockResolvedValue({
      id: "conn_1",
      status: "invalid",
      auth: { v: 1 },
    })

    await expect(buildMessagingAdsContext(identity)).rejects.toBeInstanceOf(
      MessagingAdsReconnectRequiredException,
    )
    expect(mocks.decryptObject).not.toHaveBeenCalled()
  })

  test("marks the connection invalid and throws when the stored auth blob fails to decrypt/parse", async () => {
    mocks.findForIntegration.mockResolvedValue({
      id: "conn_1",
      status: "active",
      auth: { v: 1 },
    })
    mocks.decryptObject.mockRejectedValue(new Error("bad auth tag"))

    await expect(buildMessagingAdsContext(identity)).rejects.toBeInstanceOf(
      MessagingAdsReconnectRequiredException,
    )
    expect(mocks.markInvalid).toHaveBeenCalledWith(identity)
  })

  test("resolves the context via a MessagingAdsConnection-table auth store, never the facebookAds one", async () => {
    mocks.findForIntegration.mockResolvedValue({
      id: "conn_1",
      status: "active",
      auth: { v: 1 },
    })
    mocks.decryptObject.mockResolvedValue({ accessToken: "token" })

    const ctx = await buildMessagingAdsContext(identity)

    expect(mocks.makeAuthStoreForTable).toHaveBeenCalledWith(
      "MessagingAdsConnection",
      "messagingAds:whatsapp",
      { id: "conn_1" },
    )
    expect(mocks.buildContextWithAuthStore).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_1",
        auth: { accessToken: "token" },
        authStore: { authStore: true },
      }),
    )
    expect(ctx).toMatchObject({ ctx: true })
  })
})
