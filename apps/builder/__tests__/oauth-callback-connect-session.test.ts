// @vitest-environment node

import type { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindByNonce,
  mockFailSession,
  mockCompleteAuthorization,
  mockConnectTargets,
  mockResolveForOwner,
  mockSanitizeReferer,
  mockResolveRelayTarget,
  mockNotFound,
  mockRedirect,
  mockGetCurrentUser,
} = vi.hoisted(() => ({
  mockFindByNonce: vi.fn(),
  mockFailSession: vi.fn(),
  mockCompleteAuthorization: vi.fn(),
  mockConnectTargets: vi.fn(),
  mockResolveForOwner: vi.fn(),
  mockSanitizeReferer: vi.fn(async (referer: string) => referer),
  mockResolveRelayTarget: vi.fn(async () => null),
  mockNotFound: vi.fn(() => {
    throw new Error("not found")
  }),
  mockRedirect: vi.fn((target: string) => target),
  mockGetCurrentUser: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: { resolveForOwner: mockResolveForOwner },
  hasWorkspaceAccess: vi.fn(),
  workspaceService: { findById: vi.fn(), create: vi.fn() },
  messengerIntegrationService: {},
  instagramIntegrationService: {},
  integrationWhatsappService: {},
  messagingAdsConnectionService: {},
  appointmentExternalCalendarService: {},
  integrationFacebookAdsService: {},
  integrationMetaCatalogService: {},
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: vi.fn() },
  withAuditContext: async (_ctx: unknown, fn: () => Promise<unknown>) =>
    await fn(),
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    findByNonce: mockFindByNonce,
    fail: mockFailSession,
  },
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: {
    completeAuthorization: mockCompleteAuthorization,
    connectTargets: mockConnectTargets,
  },
  CONNECTION_REGISTRY: {
    messenger: {
      credentialType: "messenger",
      provider: { multiAccount: true },
    },
    zalo: {
      credentialType: "zalo",
      provider: { multiAccount: false },
    },
    unconfigured: null,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: vi.fn() },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationGoogleSheetsModel: {},
  integrationModel: {},
  ROOT_TENANT_ID: "1",
}))

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  exchangeCodeForToken: vi.fn(),
  exchangeLongLivedToken: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-instagram", () => ({
  exchangeCodeForToken: vi.fn(),
  getInstagramAccount: vi.fn(),
  subscribePageToInstagramWebhook: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  exchangeCodeForToken: vi.fn(),
  getFacebookUser: vi.fn(),
  getUserInstagramAccounts: vi.fn(),
  subscribePageToInstagramWebhook: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-messenger", () => ({
  exchangeCodeForToken: vi.fn(),
  getFacebookUser: vi.fn(),
  getUserPages: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  exchangeLongLivedToken: vi.fn(),
  subscribePageToAppWebhook: vi.fn(),
}))

vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { oauth2: "oauth2", custom: "custom" },
  SdkException: class SdkException extends Error {},
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    getPublicUrlFromRequest: (request: { url: string }) => request.url,
  }
})

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}))

vi.mock("@/features/integration-messenger/actions/reconnect-callback", () => ({
  reconnectMessengerHandler: vi.fn(),
}))
vi.mock("@/features/integration-instagram/actions/reconnect-callback", () => ({
  reconnectInstagramHandler: vi.fn(),
  reconnectInstagramFacebookHandler: vi.fn(),
}))
vi.mock("@/features/external-calendars/lib/google-calendar-provider", () => ({
  exchangeAndVerifyGoogleCalendar: vi.fn(),
}))
vi.mock("@/features/integration-tiktok/actions/connect.action", () => ({
  connectTiktokHandler: vi.fn(),
}))
vi.mock("@/features/integration-zalo/actions/connect-zalo.action", () => ({
  connectZaloHandler: vi.fn(),
}))
vi.mock("@/features/integration-zalo/actions/reconnect-callback", () => ({
  reconnectZaloHandler: vi.fn(),
}))

vi.mock("@/integration", () => ({
  integrations: {
    messenger: {},
    instagram: {},
    instagramFacebook: {},
    facebookAds: {},
    tiktok: {},
    zalo: {},
    googleCalendar: {},
    googleSheets: {},
  },
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: vi.fn(async () => "platform-owner-1"),
}))

vi.mock("@/lib/auth/utils", () => ({ getCurrentUser: mockGetCurrentUser }))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/oauth-broker", () => ({
  buildBrokerCallbackUrl: (path: string) => `https://broker.example.com${path}`,
  getBrokerOrigin: () => "https://broker.example.com",
}))

vi.mock("@/lib/oauth-referer", () => ({
  resolveRelayTarget: mockResolveRelayTarget,
  sanitizeReferer: mockSanitizeReferer,
}))

const { handleCallback } = await import(
  "../src/app/integrations/[...integration]/callback"
)

const buildRequest = (state: string, extraParams = "") =>
  ({
    headers: new Headers(),
    url: `https://app.example.com/integrations/messenger/callback?code=code-1&state=${encodeURIComponent(state)}${extraParams}`,
  }) as unknown as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveForOwner.mockResolvedValue({
    config: { clientId: "id", clientSecret: "secret" },
    userId: null,
  })
})

describe("handleCallback — ConnectSession state dispatch", () => {
  test("a raw sessionId.nonce state still parses as valid JSON/base64 gets routed to the legacy switch and 404s for messenger without a workspaceId/user session", async () => {
    // Confirms the dispatch regex is specific: legacy base64-JSON states
    // never accidentally match `^\d+\.[A-Za-z0-9_-]+$` (e.g. plain digits
    // followed by more base64 chars containing "="/"+"/"/" would not match).
    mockGetCurrentUser.mockResolvedValue(null)
    const legacyState = Buffer.from(
      JSON.stringify({ referer: "https://app.example.com/manage" }),
    ).toString("base64")

    await expect(
      handleCallback("messenger", buildRequest(legacyState)),
    ).rejects.toThrow("not found")

    expect(mockFindByNonce).not.toHaveBeenCalled()
  })

  test("resolves the session by nonce, verifies the id matches, and 404s on mismatch", async () => {
    mockFindByNonce.mockResolvedValueOnce({ id: "999", returnUrl: null })

    await expect(
      handleCallback("messenger", buildRequest("123.abc-nonce")),
    ).rejects.toThrow("not found")

    expect(mockFindByNonce).toHaveBeenCalledWith("abc-nonce")
    expect(mockCompleteAuthorization).not.toHaveBeenCalled()
  })

  test("404s when no session resolves for the nonce", async () => {
    mockFindByNonce.mockResolvedValueOnce(undefined)

    await expect(
      handleCallback("messenger", buildRequest("123.abc-nonce")),
    ).rejects.toThrow("not found")
  })

  test("provider denial (?error=) fails the session and redirects without exchanging code", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })

    await handleCallback(
      "messenger",
      buildRequest("123.abc-nonce", "&error=access_denied"),
    )

    expect(mockFailSession).toHaveBeenCalledWith({
      id: "123",
      errorCode: "provider_denied",
    })
    expect(mockCompleteAuthorization).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith("/connect/123")
  })

  test("redirects to the session's own sanitized returnUrl when set", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: "https://app.example.com/done",
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockResolvedValueOnce({
      id: "123",
      workspaceId: "ws-1",
      status: "completed",
      targets: [],
    })

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockSanitizeReferer).toHaveBeenCalledWith(
      "https://app.example.com/done",
    )
    expect(mockRedirect).toHaveBeenCalledWith("https://app.example.com/done")
  })

  test("404s when the session's provider has no registered credentialType", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "unconfigured",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })

    await expect(
      handleCallback("messenger", buildRequest("123.abc-nonce")),
    ).rejects.toThrow("not found")
    expect(mockResolveForOwner).not.toHaveBeenCalled()
  })

  test("404s when the session has no platformOwnerId recorded", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: null,
    })

    await expect(
      handleCallback("messenger", buildRequest("123.abc-nonce")),
    ).rejects.toThrow("not found")
  })

  test("404s when the platform credential cannot be resolved", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockResolveForOwner.mockResolvedValueOnce(undefined)

    await expect(
      handleCallback("messenger", buildRequest("123.abc-nonce")),
    ).rejects.toThrow("not found")
    expect(mockCompleteAuthorization).not.toHaveBeenCalled()
  })

  test("calls completeAuthorization with the reconstructed callback URL and this exact credential config", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockResolveForOwner.mockResolvedValueOnce({
      config: { clientId: "client-9", clientSecret: "secret-9" },
      userId: null,
    })
    mockCompleteAuthorization.mockResolvedValueOnce({
      id: "123",
      workspaceId: "ws-1",
      status: "awaiting_selection",
      targets: [{ id: "page-1", selectable: false }],
    })

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockCompleteAuthorization).toHaveBeenCalledWith({
      sessionId: "123",
      nonce: "abc-nonce",
      code: "code-1",
      callbackUrl: "https://app.example.com/integrations/messenger/callback",
      credential: { clientId: "client-9", clientSecret: "secret-9" },
    })
  })

  test("auto-completes a non-multiAccount provider's single selectable target via connectTargets", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "zalo",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockResolvedValueOnce({
      id: "123",
      workspaceId: "ws-1",
      status: "awaiting_selection",
      targets: [{ id: "oa-1", selectable: true }],
    })

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockConnectTargets).toHaveBeenCalledWith({
      sessionId: "123",
      workspaceId: "ws-1",
      targetIds: ["oa-1"],
    })
  })

  test("does not auto-complete a multiAccount provider's awaiting_selection session", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockResolvedValueOnce({
      id: "123",
      workspaceId: "ws-1",
      status: "awaiting_selection",
      targets: [{ id: "page-1", selectable: true }],
    })

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockConnectTargets).not.toHaveBeenCalled()
  })

  test("does not auto-complete a builder-initiated (actorUserId) session even when non-multiAccount — its own picker confirm screen finishes the connect", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "zalo",
      returnUrl: "/channels/instagram/select?session=123",
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockResolvedValueOnce({
      id: "123",
      workspaceId: "ws-1",
      status: "awaiting_selection",
      targets: [{ id: "ig-1", selectable: true }],
      actorUserId: "user-1",
    })

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockConnectTargets).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith(
      "/channels/instagram/select?session=123",
    )
  })

  test("swallows an unexpected completeAuthorization error and still redirects to the completion page", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockRejectedValueOnce(new Error("boom"))

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockRedirect).toHaveBeenCalledWith("/connect/123")
  })
})
