// @vitest-environment node

import type { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindMessengerIntegration,
  mockUpdateMessengerIntegrationAuth,
  mockFindInstagramIntegration,
  mockUpdateInstagramIntegrationAuth,
  mockFindWhatsappIntegration,
  mockUpsertMessagingAdsConnection,
  mockResolveForOwner,
  mockIsMember,
  mockFindWorkspaceById,
  mockUpsertFacebookAds,
  mockExchangeMessengerCode,
  mockGetUserPages,
  mockGetMessengerFacebookUser,
  mockExchangeMessengerLongLivedToken,
  mockSubscribePageToAppWebhook,
  mockExchangeInstagramCode,
  mockGetInstagramAccount,
  mockSubscribeInstagramWebhook,
  mockExchangeInstagramFacebookCode,
  mockGetUserInstagramAccounts,
  mockGetInstagramFacebookUser,
  mockSubscribeInstagramFacebookWebhook,
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
  mockUpdateMessengerIntegrationAuth: vi.fn(),
  mockFindInstagramIntegration: vi.fn(),
  mockUpdateInstagramIntegrationAuth: vi.fn(),
  mockFindWhatsappIntegration: vi.fn(),
  mockUpsertMessagingAdsConnection: vi.fn(),
  mockResolveForOwner: vi.fn(),
  mockIsMember: vi.fn(),
  mockFindWorkspaceById: vi.fn(),
  mockUpsertFacebookAds: vi.fn(),
  mockExchangeMessengerCode: vi.fn(),
  mockGetUserPages: vi.fn(),
  mockGetMessengerFacebookUser: vi.fn(),
  mockExchangeMessengerLongLivedToken: vi.fn(),
  mockSubscribePageToAppWebhook: vi.fn(),
  mockExchangeInstagramCode: vi.fn(),
  mockGetInstagramAccount: vi.fn(),
  mockSubscribeInstagramWebhook: vi.fn(),
  mockExchangeInstagramFacebookCode: vi.fn(),
  mockGetUserInstagramAccounts: vi.fn(),
  mockGetInstagramFacebookUser: vi.fn(),
  mockSubscribeInstagramFacebookWebhook: vi.fn(),
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
    updateAuth: mockUpdateMessengerIntegrationAuth,
  },
  instagramIntegrationService: {
    findByIdForWorkspace: mockFindInstagramIntegration,
    updateAuth: mockUpdateInstagramIntegrationAuth,
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
  integrationFacebookAdsService: { upsert: mockUpsertFacebookAds },
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
  exchangeCodeForToken: mockExchangeInstagramCode,
  getInstagramAccount: mockGetInstagramAccount,
  subscribePageToInstagramWebhook: mockSubscribeInstagramWebhook,
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  exchangeCodeForToken: mockExchangeInstagramFacebookCode,
  getFacebookUser: mockGetInstagramFacebookUser,
  getUserInstagramAccounts: mockGetUserInstagramAccounts,
  subscribePageToInstagramWebhook: mockSubscribeInstagramFacebookWebhook,
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  exchangeCodeForToken: mockExchangeMessengerCode,
  getFacebookUser: mockGetMessengerFacebookUser,
  getUserPages: mockGetUserPages,
}))

vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  exchangeLongLivedToken: mockExchangeMessengerLongLivedToken,
  subscribePageToAppWebhook: mockSubscribePageToAppWebhook,
}))

// Spread the real module: the Threads integration reaches this test through
// the reconnect route's import graph and needs `Integration` (and any other
// transitive export) to survive the mock.
vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return {
    ...actual,
    AuthType: { ...actual.AuthType, oauth2: "oauth2", custom: "custom" },
    SdkException: class SdkException extends Error {},
  }
})

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

vi.mock("@/lib/oauth-broker", () => ({
  buildBrokerCallbackUrl: (path: string) => `https://broker.example.com${path}`,
  getBrokerOrigin: () => "https://broker.example.com",
}))

vi.mock("@/lib/oauth-referer", () => ({
  resolveRelayTarget: vi.fn(async () => null),
  sanitizeReferer: vi.fn(async (referer: string) => referer),
}))

const { handleCallback } = await import(
  "../src/app/integrations/[...integration]/callback"
)
const { sanitizeReferer } = await import("@/lib/oauth-referer")

const REFERER =
  "https://app.example.com/space/1/settings/channels?channel=messenger"

const buildCallbackRequest = (
  integrationType: string,
  stateParams: Record<string, unknown>,
) => {
  const state = Buffer.from(JSON.stringify(stateParams)).toString("base64")
  return {
    headers: new Headers(),
    url: `https://app.example.com/integrations/${integrationType}/callback?code=code-1&state=${encodeURIComponent(state)}`,
  } as unknown as NextRequest
}

describe("handleCallback OAuth reconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue("user-1")
    mockGetMessengerFacebookUser.mockResolvedValue({
      id: "fb-user-1",
      name: "FB User",
      avatarUrl: "https://fb.example/avatar.jpg",
    })
    mockGetInstagramFacebookUser.mockResolvedValue({
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
  })

  test("messenger reconnect skips the page-select flow and redirects with the result", async () => {
    mockReconnectMessengerHandler.mockResolvedValue({ status: "success" })

    await handleCallback(
      "messenger",
      buildCallbackRequest("messenger", {
        workspaceId: "1",
        referer: REFERER,
        reconnectIntegrationId: "5",
      }),
    )

    expect(mockReconnectMessengerHandler).toHaveBeenCalledWith({
      credentialConfig: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
      workspaceId: "1",
      integrationId: "5",
      code: "code-1",
      callbackUrl: "https://broker.example.com/integrations/messenger/callback",
    })
    expect(mockExchangeMessengerCode).not.toHaveBeenCalled()
    expect(mockCookieSet).not.toHaveBeenCalled()

    const redirectTarget = new URL(mockRedirect.mock.calls[0][0])
    expect(redirectTarget.searchParams.get("reconnect")).toBe("success")
    expect(redirectTarget.searchParams.get("channel")).toBe("messenger")
  })

  test("messenger reconnect failure redirects with the error reason", async () => {
    mockReconnectMessengerHandler.mockResolvedValue({
      status: "error",
      reason: "pageNotFound",
    })

    await handleCallback(
      "messenger",
      buildCallbackRequest("messenger", {
        workspaceId: "1",
        referer: REFERER,
        reconnectIntegrationId: "5",
      }),
    )

    const redirectTarget = new URL(mockRedirect.mock.calls[0][0])
    expect(redirectTarget.searchParams.get("reconnect")).toBe("error")
    expect(redirectTarget.searchParams.get("reason")).toBe("pageNotFound")
  })

  test("cancelled consent during reconnect redirects with the cancelled reason", async () => {
    const state = Buffer.from(
      JSON.stringify({
        workspaceId: "1",
        referer: REFERER,
        reconnectIntegrationId: "5",
      }),
    ).toString("base64")
    const request = {
      url: `https://app.example.com/integrations/messenger/callback?error=access_denied&state=${encodeURIComponent(state)}`,
    } as unknown as NextRequest

    await handleCallback("messenger", request)

    expect(mockReconnectMessengerHandler).not.toHaveBeenCalled()
    const redirectTarget = new URL(mockRedirect.mock.calls[0][0])
    expect(redirectTarget.searchParams.get("reconnect")).toBe("error")
    expect(redirectTarget.searchParams.get("reason")).toBe("cancelled")
  })

  test("cancelled consent without reconnect state keeps the plain redirect", async () => {
    const state = Buffer.from(
      JSON.stringify({ workspaceId: "1", referer: REFERER }),
    ).toString("base64")
    const request = {
      url: `https://app.example.com/integrations/messenger/callback?error=access_denied&state=${encodeURIComponent(state)}`,
    } as unknown as NextRequest

    await handleCallback("messenger", request)

    expect(mockRedirect).toHaveBeenCalledWith(REFERER)
  })

  test("reconnect result survives a relative referer fallback", async () => {
    // sanitizeReferer falls back to the relative "/manage" when the referer's
    // origin is not allowlisted; the redirect URL must stay relative instead
    // of throwing on `new URL`.
    vi.mocked(sanitizeReferer).mockResolvedValueOnce("/manage")
    mockReconnectMessengerHandler.mockResolvedValue({ status: "success" })

    await handleCallback(
      "messenger",
      buildCallbackRequest("messenger", {
        workspaceId: "1",
        referer: REFERER,
        reconnectIntegrationId: "5",
      }),
    )

    expect(mockRedirect).toHaveBeenCalledWith("/manage?reconnect=success")
  })

  test("reconnect state without a workspaceId is rejected", async () => {
    await expect(
      handleCallback(
        "messenger",
        buildCallbackRequest("messenger", {
          referer: REFERER,
          reconnectIntegrationId: "5",
        }),
      ),
    ).rejects.toThrow("not found")

    expect(mockReconnectMessengerHandler).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("connect flow without reconnect state still runs the page-select flow", async () => {
    mockExchangeMessengerCode.mockResolvedValue("short-token")
    mockExchangeMessengerLongLivedToken.mockResolvedValue("long-token")

    await handleCallback(
      "messenger",
      buildCallbackRequest("messenger", {
        workspaceId: "1",
        referer: REFERER,
      }),
    )

    expect(mockReconnectMessengerHandler).not.toHaveBeenCalled()
    expect(mockEncryptAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        userToken: "long-token",
        userId: "fb-user-1",
        userName: "FB User",
        userAvatarUrl: "https://fb.example/avatar.jpg",
      }),
    )
    expect(mockCookieSet).toHaveBeenCalledWith(
      "messenger-pending-auth",
      "encrypted-token",
      expect.objectContaining({ path: "/channels/messenger/select" }),
    )
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL("/channels/messenger/select", REFERER).toString(),
    )
  })

  test("google calendar callback resolves credentials with the tenant-aware owner", async () => {
    mockExchangeAndVerifyGoogleCalendar.mockResolvedValue({
      auth: { type: "oauth2", tokens: { accessToken: "google-token" } },
      providerCalendarId: "primary",
      email: "owner@example.com",
    })

    await handleCallback(
      "googleCalendar",
      buildCallbackRequest("google-calendar", {
        workspaceId: "1",
        referer:
          "https://app.example.com/space/1/appointment-calendars/external-calendars",
      }),
    )

    expect(mockResolveOwnerForWorkspace).toHaveBeenCalledWith({
      id: "1",
      ownerId: "owner-1",
      tenantId: "1",
    })
    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "platform-owner-1",
      type: "google",
    })
    expect(mockExchangeAndVerifyGoogleCalendar).toHaveBeenCalledWith({
      credentialConfig: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
      req: expect.anything(),
      callbackUrl:
        "https://broker.example.com/integrations/google-calendar/callback",
      workspaceId: "1",
    })
    expect(mockCreateGoogleFromOAuthCallback).toHaveBeenCalledWith({
      workspaceId: "1",
      auth: { type: "oauth2", tokens: { accessToken: "google-token" } },
      providerCalendarId: "primary",
      email: "owner@example.com",
    })

    const redirectTarget = new URL(mockRedirect.mock.calls[0][0])
    expect(redirectTarget.searchParams.get("externalCalendarConnect")).toBe(
      "success",
    )
  })

  test("facebook ads flow is not affected by reconnect handling", async () => {
    mockExchangeFacebookAdsCode.mockResolvedValue("short-token")
    mockExchangeFacebookAdsLongLivedToken.mockResolvedValue({
      accessToken: "ads-token",
      expiresIn: 3600,
    })

    await handleCallback(
      "messenger",
      buildCallbackRequest("messenger", {
        workspaceId: "1",
        referer: REFERER,
        flow: "facebookAds",
      }),
    )

    expect(mockUpsertFacebookAds).toHaveBeenCalled()
    expect(mockWithAuditContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "1",
      }),
      expect.any(Function),
    )
    expect(mockReconnectMessengerHandler).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith(REFERER)
  })

  test("standalone facebook ads callback stores the token inside audit context", async () => {
    mockExchangeFacebookAdsCode.mockResolvedValue("short-token")
    mockExchangeFacebookAdsLongLivedToken.mockResolvedValue({
      accessToken: "ads-token",
      expiresIn: 3600,
    })

    await handleCallback(
      "facebookAds",
      buildCallbackRequest("facebook-ads", {
        workspaceId: "1",
        referer: REFERER,
      }),
    )

    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "platform-owner-1",
      type: "messenger",
    })
    expect(mockUpsertFacebookAds).toHaveBeenCalledWith({
      workspaceId: "1",
      auth: expect.objectContaining({
        authType: "custom",
        accessToken: "ads-token",
        version: "v23.0",
      }),
      tokenExpiresAt: expect.any(Date),
    })
    expect(mockWithAuditContext).toHaveBeenCalledWith(
      {
        userId: "user-1",
        workspaceId: "1",
        ipAddress: "unknown",
        userAgent: undefined,
      },
      expect.any(Function),
    )
    expect(mockRedirect).toHaveBeenCalledWith(REFERER)
  })

  test("messagingAds flow stores the token on the per-integration connection after verifying ownership", async () => {
    mockExchangeFacebookAdsCode.mockResolvedValue("short-token")
    mockExchangeFacebookAdsLongLivedToken.mockResolvedValue({
      accessToken: "ads-token",
      expiresIn: 3600,
    })
    mockFindWhatsappIntegration.mockResolvedValue({
      id: "9",
      workspaceId: "1",
    })

    await handleCallback(
      "messenger",
      buildCallbackRequest("messenger", {
        workspaceId: "1",
        referer: REFERER,
        flow: "messagingAds",
        messagingAdsChannel: "whatsapp",
        messagingAdsIntegrationId: "9",
      }),
    )

    expect(mockFindWhatsappIntegration).toHaveBeenCalledWith({
      id: "9",
      workspaceId: "1",
    })
    expect(mockUpsertMessagingAdsConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "1",
        channel: "whatsapp",
        integrationId: "9",
        auth: expect.objectContaining({ accessToken: "ads-token" }),
      }),
    )
    expect(mockUpsertFacebookAds).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith(REFERER)
  })

  test("messagingAds flow rejects state missing channel/integrationId without storing a token", async () => {
    await expect(
      handleCallback(
        "messenger",
        buildCallbackRequest("messenger", {
          workspaceId: "1",
          referer: REFERER,
          flow: "messagingAds",
        }),
      ),
    ).rejects.toThrow("not found")

    expect(mockUpsertMessagingAdsConnection).not.toHaveBeenCalled()
  })

  test("messagingAds flow rejects an integration that does not belong to the workspace/channel", async () => {
    mockFindWhatsappIntegration.mockResolvedValue(undefined)

    await expect(
      handleCallback(
        "messenger",
        buildCallbackRequest("messenger", {
          workspaceId: "1",
          referer: REFERER,
          flow: "messagingAds",
          messagingAdsChannel: "whatsapp",
          // Forged/foreign id — the ownership lookup returns nothing.
          messagingAdsIntegrationId: "999",
        }),
      ),
    ).rejects.toThrow("not found")

    expect(mockFindWhatsappIntegration).toHaveBeenCalledWith({
      id: "999",
      workspaceId: "1",
    })
    expect(mockUpsertMessagingAdsConnection).not.toHaveBeenCalled()
    expect(mockExchangeFacebookAdsCode).not.toHaveBeenCalled()
  })

  test("messagingAds flow blocks a non-super-admin before storing any token", async () => {
    // Connecting an ads token is a super-admin action; a bare member who
    // round-trips a crafted OAuth state must be rejected at the callback.
    mockAssertSuperAdmin.mockRejectedValueOnce(
      new Error("super admin required"),
    )
    mockFindWhatsappIntegration.mockResolvedValue({ id: "9", workspaceId: "1" })

    await expect(
      handleCallback(
        "messenger",
        buildCallbackRequest("messenger", {
          workspaceId: "1",
          referer: REFERER,
          flow: "messagingAds",
          messagingAdsChannel: "whatsapp",
          messagingAdsIntegrationId: "9",
        }),
      ),
    ).rejects.toThrow("not found")

    // Blocked BEFORE ownership lookup + token exchange + storage.
    expect(mockFindWhatsappIntegration).not.toHaveBeenCalled()
    expect(mockExchangeFacebookAdsCode).not.toHaveBeenCalled()
    expect(mockUpsertMessagingAdsConnection).not.toHaveBeenCalled()
  })

  test("zalo reconnect dispatches to the handler and skips the connect flow", async () => {
    mockReconnectZaloHandler.mockResolvedValue({ status: "success" })

    const request = buildCallbackRequest("zalo", {
      workspaceId: "1",
      referer: "https://app.example.com/space/1/settings/channels?channel=zalo",
      reconnectIntegrationId: "5",
    })
    await handleCallback("zalo", request)

    expect(mockReconnectZaloHandler).toHaveBeenCalledWith({
      zaloSettings: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
      workspaceId: "1",
      integrationId: "5",
      req: request,
      callbackUrl: "https://broker.example.com/integrations/zalo/callback",
    })
    expect(mockConnectZaloHandler).not.toHaveBeenCalled()

    const redirectTarget = new URL(mockRedirect.mock.calls[0][0])
    expect(redirectTarget.searchParams.get("reconnect")).toBe("success")
    expect(redirectTarget.searchParams.get("channel")).toBe("zalo")
  })

  test("zalo reconnect failure redirects with the error reason", async () => {
    mockReconnectZaloHandler.mockResolvedValue({
      status: "error",
      reason: "accountNotFound",
    })

    await handleCallback(
      "zalo",
      buildCallbackRequest("zalo", {
        workspaceId: "1",
        referer:
          "https://app.example.com/space/1/settings/channels?channel=zalo",
        reconnectIntegrationId: "5",
      }),
    )

    expect(mockConnectZaloHandler).not.toHaveBeenCalled()
    const redirectTarget = new URL(mockRedirect.mock.calls[0][0])
    expect(redirectTarget.searchParams.get("reconnect")).toBe("error")
    expect(redirectTarget.searchParams.get("reason")).toBe("accountNotFound")
  })

  test("zalo connect flow without reconnect state still runs the connect handler", async () => {
    await handleCallback(
      "zalo",
      buildCallbackRequest("zalo", {
        workspaceId: "1",
        referer:
          "https://app.example.com/space/1/settings/channels?channel=zalo",
      }),
    )

    expect(mockConnectZaloHandler).toHaveBeenCalled()
    expect(mockReconnectZaloHandler).not.toHaveBeenCalled()
  })

  test("instagram reconnect passes the exchanged user token to the handler", async () => {
    mockExchangeInstagramCode.mockResolvedValue({
      accessToken: "ig-user-token",
      userId: "ig-user-1",
    })
    mockReconnectInstagramHandler.mockResolvedValue({ status: "success" })

    await handleCallback(
      "instagram",
      buildCallbackRequest("instagram", {
        workspaceId: "1",
        referer: REFERER,
        reconnectIntegrationId: "7",
      }),
    )

    expect(mockReconnectInstagramHandler).toHaveBeenCalledWith({
      credentialConfig: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
      workspaceId: "1",
      integrationId: "7",
      userToken: "ig-user-token",
    })
    expect(mockCookieSet).not.toHaveBeenCalled()

    const redirectTarget = new URL(mockRedirect.mock.calls[0][0])
    expect(redirectTarget.searchParams.get("reconnect")).toBe("success")
  })

  test("instagram-facebook reconnect passes the exchanged user token to the handler", async () => {
    mockExchangeInstagramFacebookCode.mockResolvedValue("igfb-user-token")
    mockReconnectInstagramFacebookHandler.mockResolvedValue({
      status: "error",
      reason: "accountNotFound",
    })

    await handleCallback(
      "instagramFacebook",
      buildCallbackRequest("instagram-facebook", {
        workspaceId: "1",
        referer: REFERER,
        reconnectIntegrationId: "7",
      }),
    )

    expect(mockReconnectInstagramFacebookHandler).toHaveBeenCalledWith({
      credentialConfig: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
      workspaceId: "1",
      integrationId: "7",
      userToken: "igfb-user-token",
    })

    const redirectTarget = new URL(mockRedirect.mock.calls[0][0])
    expect(redirectTarget.searchParams.get("reconnect")).toBe("error")
    expect(redirectTarget.searchParams.get("reason")).toBe("accountNotFound")
  })
})
