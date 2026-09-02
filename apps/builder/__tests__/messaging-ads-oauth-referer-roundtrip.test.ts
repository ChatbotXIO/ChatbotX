// @vitest-environment node

/**
 * Regression for the messaging-ads OAuth return path: the Click to Message
 * Ads tool page (`app/space/[workspaceId]/messaging-ads/[channel]/page.tsx`)
 * is a valid `referer` to round-trip through `state.referer`, and the
 * callback must send the user back to that EXACT tool URL (query string
 * included) on our own origin, while never honoring an attacker-controlled
 * `referer` on a foreign origin (open-redirect guard).
 *
 * Mirrors the mocking harness from `oauth-reconnect-callback.test.ts`
 * (`messagingAds flow` block, ~L574-677) — copied rather than imported, per
 * that file's own convention of one self-contained harness per test file.
 * Unlike that file, `@/lib/oauth-referer` and `@/lib/oauth-broker` are left
 * UNMOCKED here so `sanitizeReferer`'s real origin-allowlist logic runs;
 * `NEXT_PUBLIC_BUILDER_URL` defaults to `http://localhost:3123` in tests
 * (`packages/vitest-config/src/setup-env.ts`), which stands in for "the
 * builder origin" the task refers to.
 */

import type { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindMessengerIntegration,
  mockFindInstagramIntegration,
  mockFindWhatsappIntegration,
  mockUpsertMessagingAdsConnection,
  mockFindActiveCustomDomain,
  mockResolveForOwner,
  mockIsMember,
  mockFindWorkspaceById,
  mockExchangeMessengerCode,
  mockGetMessengerFacebookUser,
  mockExchangeFacebookAdsCode,
  mockExchangeFacebookAdsLongLivedToken,
  mockReconnectMessengerHandler,
  mockReconnectInstagramHandler,
  mockReconnectInstagramFacebookHandler,
  mockReconnectZaloHandler,
  mockConnectZaloHandler,
  mockExchangeAndVerifyGoogleCalendar,
  mockCreateGoogleFromOAuthCallback,
  mockResolveOwnerForWorkspace,
  mockGetCurrentUserId,
  mockEncryptAuth,
  mockCookieSet,
  mockNotFound,
  mockRedirect,
  mockAuditRecord,
  mockWithAuditContext,
  mockAssertSuperAdmin,
} = vi.hoisted(() => ({
  mockFindMessengerIntegration: vi.fn(),
  mockFindInstagramIntegration: vi.fn(),
  mockFindWhatsappIntegration: vi.fn(),
  mockUpsertMessagingAdsConnection: vi.fn(),
  mockFindActiveCustomDomain: vi.fn(async () => null),
  mockResolveForOwner: vi.fn(),
  mockIsMember: vi.fn(),
  mockFindWorkspaceById: vi.fn(),
  mockExchangeMessengerCode: vi.fn(),
  mockGetMessengerFacebookUser: vi.fn(),
  mockExchangeFacebookAdsCode: vi.fn(),
  mockExchangeFacebookAdsLongLivedToken: vi.fn(),
  mockReconnectMessengerHandler: vi.fn(),
  mockReconnectInstagramHandler: vi.fn(),
  mockReconnectInstagramFacebookHandler: vi.fn(),
  mockReconnectZaloHandler: vi.fn(),
  mockConnectZaloHandler: vi.fn(),
  mockExchangeAndVerifyGoogleCalendar: vi.fn(),
  mockCreateGoogleFromOAuthCallback: vi.fn(),
  mockResolveOwnerForWorkspace: vi.fn(async () => "platform-owner-1"),
  mockGetCurrentUserId: vi.fn(),
  mockEncryptAuth: vi.fn(async () => "encrypted-token"),
  mockCookieSet: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("not found")
  }),
  mockRedirect: vi.fn(),
  mockAuditRecord: vi.fn().mockResolvedValue(undefined),
  mockWithAuditContext: vi.fn(
    async (_ctx: unknown, fn: () => Promise<unknown>) => await fn(),
  ),
  mockAssertSuperAdmin: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mockAuditRecord },
  withAuditContext: mockWithAuditContext,
}))

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mockAssertSuperAdmin,
}))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findByIdForWorkspace: mockFindMessengerIntegration,
    updateAuth: vi.fn(),
  },
  instagramIntegrationService: {
    findByIdForWorkspace: mockFindInstagramIntegration,
    updateAuth: vi.fn(),
  },
  integrationWhatsappService: {
    findByIdForWorkspace: mockFindWhatsappIntegration,
  },
  messagingAdsConnectionService: {
    upsertFromOAuth: mockUpsertMessagingAdsConnection,
  },
  appointmentExternalCalendarService: {
    createGoogleFromOAuthCallback: mockCreateGoogleFromOAuthCallback,
  },
  integrationFacebookAdsService: { upsert: vi.fn() },
  // Real `@/lib/oauth-referer` calls this to decide whether a foreign
  // `referer` host is nonetheless one we control (a white-label custom
  // domain) — defaults to "no active domain" so a foreign origin is never
  // accidentally allowed.
  customDomainService: { findActiveByDomain: mockFindActiveCustomDomain },
  platformCredentialService: { resolveForOwner: mockResolveForOwner },
  workspaceMemberService: { isMember: mockIsMember },
  workspaceService: {
    findById: mockFindWorkspaceById,
    create: vi.fn(),
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
  exchangeCodeForToken: mockExchangeFacebookAdsCode,
  exchangeLongLivedToken: mockExchangeFacebookAdsLongLivedToken,
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
  exchangeCodeForToken: mockExchangeMessengerCode,
  getFacebookUser: mockGetMessengerFacebookUser,
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

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: mockCookieSet })),
}))

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}))

vi.mock("@/features/integration-messenger/actions/reconnect-callback", () => ({
  reconnectMessengerHandler: mockReconnectMessengerHandler,
}))

vi.mock("@/features/integration-instagram/actions/reconnect-callback", () => ({
  reconnectInstagramHandler: mockReconnectInstagramHandler,
  reconnectInstagramFacebookHandler: mockReconnectInstagramFacebookHandler,
}))

vi.mock("@/features/external-calendars/lib/google-calendar-provider", () => ({
  exchangeAndVerifyGoogleCalendar: mockExchangeAndVerifyGoogleCalendar,
}))

vi.mock("@/features/integration-tiktok/actions/connect.action", () => ({
  connectTiktokHandler: vi.fn(),
}))

vi.mock("@/features/integration-zalo/actions/connect-zalo.action", () => ({
  connectZaloHandler: mockConnectZaloHandler,
}))

vi.mock("@/features/integration-zalo/actions/reconnect-callback", () => ({
  reconnectZaloHandler: mockReconnectZaloHandler,
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
  resolveOwnerForWorkspace: mockResolveOwnerForWorkspace,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: mockGetCurrentUserId,
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/facebook-pending-auth", () => ({
  encryptAuth: mockEncryptAuth,
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE: "igfb-pending-auth",
  FB_INSTAGRAM_PENDING_AUTH_COOKIE: "ig-pending-auth",
  FB_MESSENGER_PENDING_AUTH_COOKIE: "messenger-pending-auth",
  FB_PENDING_AUTH_MAX_AGE: 600,
}))

// NOTE: `@/lib/oauth-referer` and `@/lib/oauth-broker` are deliberately left
// unmocked — this file's whole point is exercising their real
// allowlist/sanitization logic against the round-tripped tool URL.

const { handleCallback } = await import(
  "../src/app/integrations/[...integration]/callback"
)
const { FALLBACK_REDIRECT } = await import("@/lib/oauth-referer")

// Matches `NEXT_PUBLIC_BUILDER_URL`'s test default
// (`packages/vitest-config/src/setup-env.ts`) — the origin `sanitizeReferer`
// allows as "our own app".
const BUILDER_ORIGIN = "http://localhost:3123"

// The callback must land on the SAME host as `BUILDER_ORIGIN` (our own app)
// — a different host would trigger `resolveRelayTarget`'s white-label relay
// bounce instead of reaching the `messagingAds` branch under test. The
// foreign-origin test deliberately keeps a mismatched `referer` host
// (an attacker-controlled origin), which `resolveRelayTarget` correctly
// declines to relay to (not an origin we control).
const buildCallbackRequest = (stateParams: Record<string, unknown>) => {
  const state = Buffer.from(JSON.stringify(stateParams)).toString("base64")
  return {
    headers: new Headers(),
    url: `${BUILDER_ORIGIN}/integrations/messenger/callback?code=code-1&state=${encodeURIComponent(state)}`,
  } as unknown as NextRequest
}

describe("messaging-ads OAuth referer round-trip", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindActiveCustomDomain.mockResolvedValue(null)
    mockGetCurrentUserId.mockResolvedValue("user-1")
    mockGetMessengerFacebookUser.mockResolvedValue({
      id: "fb-user-1",
      name: "FB User",
      avatarUrl: "https://fb.example/avatar.jpg",
    })
    mockFindWorkspaceById.mockResolvedValue({
      id: "1",
      ownerId: "owner-1",
      tenantId: "1",
    })
    mockIsMember.mockResolvedValue(true)
    mockResolveOwnerForWorkspace.mockResolvedValue("platform-owner-1")
    mockResolveForOwner.mockResolvedValue({
      config: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
    })
    mockFindMessengerIntegration.mockResolvedValue({
      id: "11651983482568704",
      workspaceId: "1",
    })
    mockExchangeFacebookAdsCode.mockResolvedValue("short-token")
    mockExchangeFacebookAdsLongLivedToken.mockResolvedValue({
      accessToken: "ads-token",
      expiresIn: 3600,
    })
  })

  test("redirects to the exact tool URL (query string included) when the referer is our own builder origin", async () => {
    const toolUrl = `${BUILDER_ORIGIN}/space/ws1/messaging-ads/messenger?integration=11651983482568704`

    await handleCallback(
      "messenger",
      buildCallbackRequest({
        workspaceId: "1",
        referer: toolUrl,
        flow: "messagingAds",
        messagingAdsChannel: "messenger",
        messagingAdsIntegrationId: "11651983482568704",
      }),
    )

    expect(mockUpsertMessagingAdsConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "1",
        channel: "messenger",
        integrationId: "11651983482568704",
      }),
    )
    expect(mockRedirect).toHaveBeenCalledWith(toolUrl)
  })

  test("sanitizes a foreign-origin referer to the fallback redirect instead of the attacker URL", async () => {
    const attackerUrl =
      "https://evil.example/space/ws1/messaging-ads/messenger?integration=1"

    await handleCallback(
      "messenger",
      buildCallbackRequest({
        workspaceId: "1",
        referer: attackerUrl,
        flow: "messagingAds",
        messagingAdsChannel: "messenger",
        messagingAdsIntegrationId: "11651983482568704",
      }),
    )

    expect(mockUpsertMessagingAdsConnection).toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith(FALLBACK_REDIRECT)
    expect(mockRedirect).not.toHaveBeenCalledWith(attackerUrl)
    expect(mockRedirect).not.toHaveBeenCalledWith(
      expect.stringContaining("evil.example"),
    )
  })
})
