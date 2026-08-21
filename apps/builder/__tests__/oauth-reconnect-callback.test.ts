// @vitest-environment node

import type { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindMessengerIntegration,
  mockUpdateMessengerIntegrationAuth,
  mockFindInstagramIntegration,
  mockUpdateInstagramIntegrationAuth,
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
  mockExchangeAndVerifyGoogleCalendar,
  mockCreateGoogleFromOAuthCallback,
  mockResolveOwnerForWorkspace,
  mockGetCurrentUserId,
  mockEncryptAuth,
  mockCookieSet,
  mockNotFound,
  mockRedirect,
} = vi.hoisted(() => ({
  mockFindMessengerIntegration: vi.fn(),
  mockUpdateMessengerIntegrationAuth: vi.fn(),
  mockFindInstagramIntegration: vi.fn(),
  mockUpdateInstagramIntegrationAuth: vi.fn(),
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
  connectZaloHandler: vi.fn(),
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
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
    expect(mockReconnectMessengerHandler).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith(REFERER)
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
