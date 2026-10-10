// @vitest-environment node

import {
  connectionCredentialsRejectedException,
  connectionNoCandidatesException,
  connectionProviderUnavailableException,
  connectionStateMismatchException,
  connectSessionExpiredException,
} from "@chatbotx.io/business/errors"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import type * as DatabaseSchema from "@chatbotx.io/database/schema"
import type * as ChatbotxUtilsModule from "@chatbotx.io/utils"
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
  mockLoggerDebug,
  mockLoggerWarn,
  mockLoggerError,
  mockFindActiveByTenantId,
  mockFindByOwner,
  mockIsCloud,
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
  mockLoggerDebug: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockFindActiveByTenantId: vi.fn(),
  mockFindByOwner: vi.fn(),
  mockIsCloud: vi.fn(() => false),
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
  integrationThreadsService: {},
  customDomainService: { findActiveByTenantId: mockFindActiveByTenantId },
  tenantService: { findByOwner: mockFindByOwner },
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
    instagramFacebook: {
      credentialType: "instagramFacebook",
      provider: { multiAccount: true },
    },
    unconfigured: null,
  },
  // Mirrors the real `packages/connections` `failSession`'s exact contract
  // (forwards to `connectSessionService.fail`, shaping its payload the
  // same way) including its own try/catch swallow of a persistence
  // failure — several tests below rely on that swallow behavior rather
  // than letting a DB blip during `fail()` escape as an unhandled
  // rejection.
  failSession: async (
    session: { id: string; workspaceId: string; provider: string },
    errorCode: string,
    statuses?: string[],
  ) => {
    try {
      await mockFailSession({
        id: session.id,
        workspaceId: session.workspaceId,
        errorCode,
        ...(statuses ? { statuses } : {}),
      })
    } catch {
      // swallow — matches the real `failSession`'s best-effort contract
    }
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: vi.fn() },
}))

vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual = await importOriginal<typeof DatabaseSchema>()
  return {
    ...actual,
    integrationGoogleSheetsModel: {},
    integrationModel: {},
    ROOT_TENANT_ID: "1",
  }
})

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
vi.mock("@chatbotx.io/integration-tiktok", () => ({
  TiktokMissingScopesError: class TiktokMissingScopesError extends Error {},
}))
vi.mock("@chatbotx.io/integration-threads", () => ({
  buildThreadsAuthValue: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  getThreadsProfile: vi.fn(),
}))

vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { oauth2: "oauth2", custom: "custom" },
  SdkException: class SdkException extends Error {},
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof ChatbotxUtilsModule>()
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
vi.mock("@/features/integration-threads/actions/reconnect-callback", () => ({
  reconnectThreadsHandler: vi.fn(),
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
    unconfigured: {},
  },
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: vi.fn(async () => "platform-owner-1"),
}))

vi.mock("@/lib/auth/utils", () => ({ getCurrentUser: mockGetCurrentUser }))

vi.mock("@/lib/log", () => ({
  logger: {
    debug: mockLoggerDebug,
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}))

vi.mock("@/env", () => ({ isCloud: mockIsCloud }))

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

  test("404s when the session's provider does not match the integrationType resolved from the callback route, without attempting a fail or code exchange", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "zalo",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })

    await expect(
      handleCallback("messenger", buildRequest("123.abc-nonce")),
    ).rejects.toThrow("not found")

    expect(mockFailSession).not.toHaveBeenCalled()
    expect(mockCompleteAuthorization).not.toHaveBeenCalled()
  })

  test("provider denial (?error=access_denied) fails the session with provider_denied and redirects without exchanging code", async () => {
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
      statuses: ["pending"],
    })
    expect(mockCompleteAuthorization).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith("/connect/123")
  })

  test("a non-access_denied provider error (regression: every ?error= value used to be reported as provider_denied) fails the session with provider_error instead", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })

    await handleCallback(
      "messenger",
      buildRequest("123.abc-nonce", "&error=server_error"),
    )

    expect(mockFailSession).toHaveBeenCalledWith({
      id: "123",
      errorCode: "provider_error",
      statuses: ["pending"],
    })
  })

  test("a DB blip inside failSession while recording the ?error= outcome is swallowed by its own try/catch — the request still redirects instead of throwing", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockFailSession.mockRejectedValueOnce(new Error("db blip"))

    await handleCallback(
      "messenger",
      buildRequest("123.abc-nonce", "&error=access_denied"),
    )

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

  test("404s when the session's provider has no registered credentialType, and fails the session instead of leaving it stuck (regression)", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "unconfigured",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })

    await expect(
      handleCallback(
        "unconfigured" as IntegrationType,
        buildRequest("123.abc-nonce"),
      ),
    ).rejects.toThrow("not found")

    expect(mockResolveForOwner).not.toHaveBeenCalled()
    expect(mockFailSession).toHaveBeenCalledWith({
      id: "123",
      errorCode: "internal_error",
      statuses: ["pending"],
    })
  })

  test("404s when the session has no platformOwnerId recorded, and fails the session instead of leaving it stuck (regression)", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: null,
    })

    await expect(
      handleCallback("messenger", buildRequest("123.abc-nonce")),
    ).rejects.toThrow("not found")

    expect(mockFailSession).toHaveBeenCalledWith({
      id: "123",
      errorCode: "internal_error",
      statuses: ["pending"],
    })
  })

  test("404s when the platform credential cannot be resolved, and fails the session instead of leaving it stuck (regression)", async () => {
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
    expect(mockFailSession).toHaveBeenCalledWith({
      id: "123",
      errorCode: "internal_error",
      statuses: ["pending"],
    })
  })

  test("a DB blip inside failSession for an OAuth-unconfigured provider is swallowed — still 404s instead of throwing", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "unconfigured",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockFailSession.mockRejectedValueOnce(new Error("db blip"))

    await expect(
      handleCallback(
        "unconfigured" as IntegrationType,
        buildRequest("123.abc-nonce"),
      ),
    ).rejects.toThrow("not found")
  })

  test("a DB blip inside failSession for a missing platform credential is swallowed — still 404s instead of throwing", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockResolveForOwner.mockResolvedValueOnce(undefined)
    mockFailSession.mockRejectedValueOnce(new Error("db blip"))

    await expect(
      handleCallback("messenger", buildRequest("123.abc-nonce")),
    ).rejects.toThrow("not found")
  })

  test("calls completeAuthorization with the callback URL resolved from the registered credential's origin, not this request's own host — a platform credential's redirect_uri is the broker even when the request lands on a different app host", async () => {
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

    // `buildRequest` lands on "https://app.example.com" — deliberately NOT
    // the broker origin ("https://broker.example.com", mocked above) — so a
    // `callbackUrl` built from `url.origin` instead of the credential would
    // silently pass this assertion if they happened to match.
    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockCompleteAuthorization).toHaveBeenCalledWith({
      sessionId: "123",
      nonce: "abc-nonce",
      code: "code-1",
      callbackUrl: "https://broker.example.com/integrations/messenger/callback",
      credential: { clientId: "client-9", clientSecret: "secret-9" },
    })
  })

  test("after a white-label relay, resolves the callback URL from a tenant-owned credential's custom domain, not the relayed-to originHost", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
      // Already on the target host (`resolveRelayTarget` no-ops, mocked to
      // return `null`), as if this is the second request after the relay
      // redirect — the scenario the bug reaches.
      originHost: "app.example.com",
    })
    mockIsCloud.mockReturnValue(true)
    mockResolveForOwner.mockResolvedValueOnce({
      config: { clientId: "client-9", clientSecret: "secret-9" },
      userId: "reseller-owner-1",
    })
    mockFindByOwner.mockResolvedValueOnce({ id: "t1", status: "active" })
    mockFindActiveByTenantId.mockResolvedValueOnce({ domain: "chat.acme.com" })
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
      callbackUrl: "https://chat.acme.com/integrations/messenger/callback",
      credential: { clientId: "client-9", clientSecret: "secret-9" },
    })
  })

  test("uses the kebab-case registered callback path for a camelCase provider key", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "instagramFacebook",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockResolvedValueOnce({
      id: "123",
      workspaceId: "ws-1",
      status: "awaiting_selection",
      targets: [],
    })

    await handleCallback("instagramFacebook", {
      headers: new Headers(),
      url: "https://app.example.com/integrations/instagram-facebook/callback?code=code-1&state=123.abc-nonce",
    } as unknown as NextRequest)

    expect(mockCompleteAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackUrl:
          "https://broker.example.com/integrations/instagram-facebook/callback",
      }),
    )
  })

  test("after the relay has landed the callback on originHost, the exchange still uses the broker redirect_uri (regression: production exchange_failed)", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
      originHost: "app.example.com",
    })
    mockCompleteAuthorization.mockResolvedValueOnce({
      id: "123",
      workspaceId: "ws-1",
      status: "awaiting_selection",
      targets: [],
    })

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    // Already on originHost, so the relay is a no-op for this request.
    expect(mockResolveRelayTarget).toHaveBeenCalledWith(
      expect.any(URL),
      "https://app.example.com",
    )
    expect(mockCompleteAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackUrl:
          "https://broker.example.com/integrations/messenger/callback",
      }),
    )
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

    await handleCallback("zalo", buildRequest("123.abc-nonce"))

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

    await handleCallback("zalo", buildRequest("123.abc-nonce"))

    expect(mockConnectTargets).not.toHaveBeenCalled()
    // `returnUrl` is stored relative — resolved against this callback's own
    // public origin (`url.origin`) before `sanitizeReferer`, which only
    // accepts absolute URLs (see the `returnUrl` resolution comment in
    // `handleConnectSessionCallback`).
    expect(mockSanitizeReferer).toHaveBeenCalledWith(
      "https://app.example.com/channels/instagram/select?session=123",
    )
    expect(mockRedirect).toHaveBeenCalledWith(
      "https://app.example.com/channels/instagram/select?session=123",
    )
  })

  test("swallows an unexpected completeAuthorization error, fails the session, and still redirects to the completion page (regression: previously left the session stuck in its prior status)", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockRejectedValueOnce(new Error("boom"))

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockFailSession).toHaveBeenCalledWith({
      id: "123",
      errorCode: "internal_error",
    })
    expect(mockRedirect).toHaveBeenCalledWith(
      "/connect/123?connect_error=internal_error",
    )
  })

  test("a DB blip inside failSession for an unexpected completeAuthorization error is swallowed — the request still redirects instead of throwing", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockRejectedValueOnce(new Error("boom"))
    mockFailSession.mockRejectedValueOnce(new Error("db blip"))

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockRedirect).toHaveBeenCalledWith(
      "/connect/123?connect_error=internal_error",
    )
  })

  test("fails the session when the post-authorization auto-connect (connectTargets) throws (regression: item 10 — the session previously stayed awaiting_selection forever)", async () => {
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
    mockConnectTargets.mockRejectedValueOnce(new Error("boom"))

    await handleCallback("zalo", buildRequest("123.abc-nonce"))

    expect(mockFailSession).toHaveBeenCalledWith({
      id: "123",
      errorCode: "internal_error",
    })
    expect(mockRedirect).toHaveBeenCalledWith(
      "/connect/123?connect_error=internal_error",
    )
  })

  test("replaying the callback while the session is still legitimately active (completeAuthorization rejects the duplicate code exchange) redirects without failing the session (regression: a double-fired/replayed callback must not corrupt a connect that's genuinely still in progress)", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    // `completeAuthorization`'s own `status !== "pending"` guard throws this
    // exact exception for a session that's already moved on (awaiting
    // selection, authorized, or completed) — the real shape a replayed
    // callback produces, not a generic unexpected error.
    mockCompleteAuthorization.mockRejectedValueOnce(
      connectSessionExpiredException(
        "This connect session is no longer active.",
      ),
    )

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockFailSession).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith("/connect/123")
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "123", provider: "messenger" }),
      "connect session completeAuthorization replay ignored",
    )
    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test("a forged/stale state on replay (connectionStateMismatch) also redirects without failing the session", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockRejectedValueOnce(
      connectionStateMismatchException(),
    )

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockFailSession).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith("/connect/123")
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "123", provider: "messenger" }),
      "connect session completeAuthorization replay ignored",
    )
    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test("a retryable provider-unavailable error (session already released back to pending) does not fail the session, only the non-retryable case terminalizes it", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    // The exact exception `completeAuthorization` throws after a transient
    // 502/503 from the provider, once it has already released the claim
    // back to `pending` so a later retry can still complete the connect.
    mockCompleteAuthorization.mockRejectedValueOnce(
      connectionProviderUnavailableException(503),
    )

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockFailSession).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith(
      "/connect/123?connect_error=provider_unavailable",
    )
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "123", provider: "messenger" }),
      "connect session completeAuthorization failed with a retryable provider error — left active for retry",
    )
    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test("a retryable failure keeps the session's own returnUrl query (?session=) and appends connect_error", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: "/space/1/settings/integrations/google-ads?session=123",
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockRejectedValueOnce(
      connectionProviderUnavailableException(502),
    )

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockFailSession).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith(
      "https://app.example.com/space/1/settings/integrations/google-ads?session=123&connect_error=provider_unavailable",
    )
  })

  test("a provider-specific failure cause rides in connect_error while the session keeps its stored code", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    const rejection = connectionCredentialsRejectedException("rejected")
    rejection.data = { cause: "developer_token_not_approved" }
    mockCompleteAuthorization.mockRejectedValueOnce(rejection)

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockRedirect).toHaveBeenCalledWith(
      "/connect/123?connect_error=developer_token_not_approved",
    )
  })

  test("a provider rejection with no recognised cause leaves the stored session code to speak (no connect_error)", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockRejectedValueOnce(
      connectionCredentialsRejectedException("rejected"),
    )

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockRedirect).toHaveBeenCalledWith("/connect/123")
  })

  test("a forged cause that is not an allow-listed value is ignored", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    const rejection = connectionCredentialsRejectedException("rejected")
    rejection.data = { cause: "<script>alert(1)</script>" }
    mockCompleteAuthorization.mockRejectedValueOnce(rejection)

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockRedirect).toHaveBeenCalledWith("/connect/123")
  })

  test("no candidates redirects with connect_error=no_candidates", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      platformOwnerId: "owner-1",
    })
    mockCompleteAuthorization.mockRejectedValueOnce(
      connectionNoCandidatesException(),
    )

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockRedirect).toHaveBeenCalledWith(
      "/connect/123?connect_error=no_candidates",
    )
  })

  test("an unexpected throw before the exchange (credential resolution) never surfaces as a 500: the session is failed and the person is redirected with connect_error=internal_error", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: "/space/1/settings/integrations/google-ads?session=123",
      platformOwnerId: "owner-1",
    })
    mockResolveForOwner.mockRejectedValueOnce(new Error("decrypt failed"))

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockCompleteAuthorization).not.toHaveBeenCalled()
    expect(mockFailSession).toHaveBeenCalledWith({
      id: "123",
      errorCode: "internal_error",
    })
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), sessionId: "123" }),
      "connect session callback failed unexpectedly",
    )
    expect(mockRedirect).toHaveBeenCalledWith(
      "https://app.example.com/space/1/settings/integrations/google-ads?session=123&connect_error=internal_error",
    )
  })

  test("the pre-exchange fallback still redirects when failSession itself and the return URL resolution fail", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: "/x",
      platformOwnerId: "owner-1",
    })
    // Rejects in the main flow and again in the fallback's own resolution.
    mockSanitizeReferer
      .mockRejectedValueOnce(new Error("sanitize"))
      .mockRejectedValueOnce(new Error("sanitize"))
    mockFailSession.mockRejectedValueOnce(new Error("db blip"))

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockRedirect).toHaveBeenCalledWith(
      "/connect/123?connect_error=internal_error",
    )
  })

  test("a notFound/redirect control-flow throw from the relay is not swallowed by the safety net", async () => {
    mockFindByNonce.mockResolvedValueOnce({
      id: "123",
      provider: "messenger",
      returnUrl: null,
      originHost: "app.example.com",
      platformOwnerId: "owner-1",
    })
    mockResolveRelayTarget.mockResolvedValueOnce(
      "https://relay.example.com/x" as never,
    )

    await handleCallback("messenger", buildRequest("123.abc-nonce"))

    expect(mockRedirect).toHaveBeenCalledWith("https://relay.example.com/x")
    expect(mockFailSession).not.toHaveBeenCalled()
  })
})
