// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindMessengerIntegration,
  mockUpdateMessengerIntegrationAuth,
  mockFindInstagramIntegration,
  mockUpdateInstagramIntegrationAuth,
  mockExchangeMessengerCode,
  mockDebugMessengerToken,
  mockGetUserPages,
  mockGetMessengerFacebookUser,
  mockExchangeMessengerLongLivedToken,
  mockToMessengerAppAccessToken,
  mockEnsureMessengerWhitelistedDomain,
  mockSubscribePageToAppWebhook,
  mockScopesToPageSubscribeFields,
  mockResolveTenantSettings,
  mockGetInstagramAccount,
  mockSubscribeInstagramWebhook,
  mockGetUserInstagramAccounts,
  mockGetInstagramFacebookUser,
  mockSubscribeInstagramFacebookWebhook,
  mockBuildIntegrationUserInfo,
  mockLookupIntegrationUserInfo,
} = vi.hoisted(() => ({
  mockFindMessengerIntegration: vi.fn(),
  mockUpdateMessengerIntegrationAuth: vi.fn(),
  mockFindInstagramIntegration: vi.fn(),
  mockUpdateInstagramIntegrationAuth: vi.fn(),
  mockExchangeMessengerCode: vi.fn(),
  mockDebugMessengerToken: vi.fn(),
  mockGetUserPages: vi.fn(),
  mockGetMessengerFacebookUser: vi.fn(),
  mockExchangeMessengerLongLivedToken: vi.fn(),
  mockToMessengerAppAccessToken: vi.fn(),
  mockEnsureMessengerWhitelistedDomain: vi.fn(),
  mockSubscribePageToAppWebhook: vi.fn(),
  mockScopesToPageSubscribeFields: vi.fn(),
  mockResolveTenantSettings: vi.fn(),
  mockGetInstagramAccount: vi.fn(),
  mockSubscribeInstagramWebhook: vi.fn(),
  mockGetUserInstagramAccounts: vi.fn(),
  mockGetInstagramFacebookUser: vi.fn(),
  mockSubscribeInstagramFacebookWebhook: vi.fn(),
  mockBuildIntegrationUserInfo: vi.fn(),
  mockLookupIntegrationUserInfo: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  resolveTenantSettings: mockResolveTenantSettings,
  messengerIntegrationService: {
    findByIdForWorkspace: mockFindMessengerIntegration,
    updateAuth: mockUpdateMessengerIntegrationAuth,
  },
  instagramIntegrationService: {
    findByIdForWorkspace: mockFindInstagramIntegration,
    updateAuth: mockUpdateInstagramIntegrationAuth,
  },
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  debugToken: mockDebugMessengerToken,
  exchangeCodeForToken: mockExchangeMessengerCode,
  getFacebookUser: mockGetMessengerFacebookUser,
  getUserPages: mockGetUserPages,
  toAppAccessToken: mockToMessengerAppAccessToken,
}))

vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  ensureMessengerWhitelistedDomain: mockEnsureMessengerWhitelistedDomain,
  exchangeLongLivedToken: mockExchangeMessengerLongLivedToken,
  scopesToPageSubscribeFields: mockScopesToPageSubscribeFields,
  subscribePageToAppWebhook: mockSubscribePageToAppWebhook,
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  getInstagramAccount: mockGetInstagramAccount,
  subscribePageToInstagramWebhook: mockSubscribeInstagramWebhook,
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  getFacebookUser: mockGetInstagramFacebookUser,
  getUserInstagramAccounts: mockGetUserInstagramAccounts,
  subscribePageToInstagramWebhook: mockSubscribeInstagramFacebookWebhook,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { oauth2: "oauth2" },
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Pass-through impl of the real helpers minus the avatar upload: the upload is
// storage-dependent, so tests stamp a fixed path when an avatarUrl is given.
vi.mock("@/lib/integration-user-info", () => ({
  buildIntegrationUserInfo: mockBuildIntegrationUserInfo,
  lookupIntegrationUserInfo: mockLookupIntegrationUserInfo,
}))

const { reconnectMessengerHandler } = await import(
  "../src/features/integration-messenger/actions/reconnect-callback"
)
const { reconnectInstagramHandler, reconnectInstagramFacebookHandler } =
  await import(
    "../src/features/integration-instagram/actions/reconnect-callback"
  )

const credentialConfig = {
  clientId: "client-1",
  clientSecret: "secret-1",
  version: "v23.0",
}

const UPLOADED_AVATAR_PATH = "public/space/ws-1/avatars/uploaded.jpg"

// Mirrors the real helper's contract: null without an identity; `avatar` is
// the freshly uploaded path when an avatarUrl was provided, otherwise it
// falls back to `existingAvatar` (never dropped).
const stubBuildIntegrationUserInfo = () => {
  mockBuildIntegrationUserInfo.mockImplementation(
    async (props: {
      userId?: string
      userName?: string
      userAccessToken?: string
      avatarUrl?: string
      existingAvatar?: string
    }) =>
      props.userId && props.userAccessToken
        ? {
            userId: props.userId,
            userName: props.userName ?? "",
            userAccessToken: props.userAccessToken,
            avatar: props.avatarUrl
              ? UPLOADED_AVATAR_PATH
              : props.existingAvatar,
          }
        : null,
  )
}

// Mirrors the real helper's contract: fetches the identity, then builds
// through the same avatar-fallback rule as `buildIntegrationUserInfo`; a
// failed fetch resolves to null instead of throwing.
const stubLookupIntegrationUserInfo = () => {
  mockLookupIntegrationUserInfo.mockImplementation(
    async (props: {
      userAccessToken: string
      existingAvatar?: string
      fetchUser: () => Promise<{
        id: string
        name: string
        avatarUrl?: string
      }>
    }) => {
      try {
        const fbUser = await props.fetchUser()
        return {
          userId: fbUser.id,
          userName: fbUser.name,
          userAccessToken: props.userAccessToken,
          avatar: fbUser.avatarUrl
            ? UPLOADED_AVATAR_PATH
            : props.existingAvatar,
        }
      } catch {
        return null
      }
    },
  )
}

describe("reconnectMessengerHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMessengerIntegration.mockResolvedValue({
      id: "im-1",
      pageId: "page-1",
    })
    mockExchangeMessengerCode.mockResolvedValue("short-token")
    mockGetMessengerFacebookUser.mockResolvedValue({
      id: "fb-user-1",
      name: "FB User",
      avatarUrl: "https://fb.example/avatar.jpg",
    })
    stubLookupIntegrationUserInfo()
    mockExchangeMessengerLongLivedToken.mockImplementation(
      async (_config: unknown, token: string) => `long-${token}`,
    )
    mockToMessengerAppAccessToken.mockReturnValue("app-access-token")
    mockResolveTenantSettings.mockResolvedValue({
      appUrl: "https://app.example.test",
    })
    mockDebugMessengerToken.mockResolvedValue({ scopes: ["pages_messaging"] })
    mockEnsureMessengerWhitelistedDomain.mockResolvedValue(undefined)
    mockScopesToPageSubscribeFields.mockReturnValue([
      "messages",
      "messaging_postbacks",
    ])
    mockGetUserPages.mockResolvedValue({
      pages: [
        { id: "page-1", name: "Page One", access_token: "page-token" },
        { id: "page-2", name: "Page Two", access_token: "other-token" },
      ],
      bmLookupFailed: false,
    })
  })

  const executeReconnect = () =>
    reconnectMessengerHandler({
      credentialConfig,
      workspaceId: "ws-1",
      integrationId: "im-1",
      code: "code-1",
      callbackUrl: "https://broker.example.com/integrations/messenger/callback",
    })

  test("stores the matched page's long-lived token and preserves the pageId", async () => {
    const result = await executeReconnect()

    expect(result).toEqual({ status: "success" })
    expect(mockSubscribePageToAppWebhook).toHaveBeenCalledWith({
      pageId: "page-1",
      accessToken: "long-page-token",
      version: "v23.0",
      subscribedFields: "messages,messaging_postbacks",
    })
    expect(mockEnsureMessengerWhitelistedDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        appUrl: "https://app.example.test",
        ctx: expect.objectContaining({
          auth: expect.objectContaining({
            tokens: { accessToken: "long-page-token" },
          }),
        }),
      }),
    )
    expect(mockUpdateMessengerIntegrationAuth).toHaveBeenCalledWith({
      id: "im-1",
      workspaceId: "ws-1",
      auth: expect.objectContaining({
        tokens: { accessToken: "long-page-token" },
        metadata: {
          pageId: "page-1",
          pageName: "Page One",
          version: "v23.0",
        },
      }),
      name: "Page One",
      userInfo: {
        userId: "fb-user-1",
        userName: "FB User",
        userAccessToken: "long-short-token",
        avatar: UPLOADED_AVATAR_PATH,
      },
    })
    // DB write must land before the webhook subscription so a failed write
    // never leaves the webhook re-bound to a token the row doesn't hold.
    expect(
      mockUpdateMessengerIntegrationAuth.mock.invocationCallOrder[0],
    ).toBeLessThan(mockSubscribePageToAppWebhook.mock.invocationCallOrder[0])
  })

  test("still succeeds without userInfo when the user lookup fails", async () => {
    mockGetMessengerFacebookUser.mockRejectedValue(new Error("graph down"))

    const result = await executeReconnect()

    expect(result).toEqual({ status: "success" })
    expect(mockUpdateMessengerIntegrationAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          tokens: { accessToken: "long-page-token" },
        }),
      }),
    )
    expect(
      mockUpdateMessengerIntegrationAuth.mock.calls[0][0].userInfo,
    ).toBeUndefined()
  })

  test("still succeeds when refreshing the whitelisted domain fails after auth is stored", async () => {
    mockEnsureMessengerWhitelistedDomain.mockRejectedValue(
      new Error("graph timeout"),
    )

    const result = await executeReconnect()

    expect(result).toEqual({ status: "success" })
    expect(mockUpdateMessengerIntegrationAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          tokens: { accessToken: "long-page-token" },
        }),
      }),
    )
  })

  test("keeps the previously stored avatar when the refreshed identity has no avatarUrl", async () => {
    mockFindMessengerIntegration.mockResolvedValue({
      id: "im-1",
      pageId: "page-1",
      userInfo: { avatar: "public/space/ws-1/avatars/old.jpg" },
    })
    mockGetMessengerFacebookUser.mockResolvedValue({
      id: "fb-user-1",
      name: "FB User",
    })

    const result = await executeReconnect()

    expect(result).toEqual({ status: "success" })
    expect(
      mockUpdateMessengerIntegrationAuth.mock.calls[0][0].userInfo,
    ).toEqual({
      userId: "fb-user-1",
      userName: "FB User",
      userAccessToken: "long-short-token",
      avatar: "public/space/ws-1/avatars/old.jpg",
    })
  })

  test("returns pageNotFound and keeps the row untouched when the page is missing", async () => {
    mockGetUserPages.mockResolvedValue({
      pages: [{ id: "page-2", name: "Page Two", access_token: "other-token" }],
      bmLookupFailed: false,
    })

    const result = await executeReconnect()

    expect(result).toEqual({ status: "error", reason: "pageNotFound" })
    expect(mockUpdateMessengerIntegrationAuth).not.toHaveBeenCalled()
    expect(mockSubscribePageToAppWebhook).not.toHaveBeenCalled()
  })

  test("returns notFound when the integration is not in the workspace", async () => {
    mockFindMessengerIntegration.mockResolvedValue(undefined)

    const result = await executeReconnect()

    expect(result).toEqual({ status: "error", reason: "notFound" })
    expect(mockExchangeMessengerCode).not.toHaveBeenCalled()
    expect(mockUpdateMessengerIntegrationAuth).not.toHaveBeenCalled()
  })

  test("returns failed when a Graph call throws", async () => {
    mockGetUserPages.mockRejectedValue(new Error("graph down"))

    const result = await executeReconnect()

    expect(result).toEqual({ status: "error", reason: "failed" })
    expect(mockUpdateMessengerIntegrationAuth).not.toHaveBeenCalled()
  })
})

describe("reconnectInstagramHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindInstagramIntegration.mockResolvedValue({
      id: "ig-1",
      type: "instagram",
      igId: "ig-user-9",
      pageId: "me-1",
    })
    mockGetInstagramAccount.mockResolvedValue({
      id: "me-1",
      userId: "ig-user-9",
      name: "IG Account",
      username: "ig_account",
      accessToken: "ig-user-token",
      profile_picture_url: "https://ig.example/avatar.jpg",
    })
    stubBuildIntegrationUserInfo()
  })

  const executeReconnect = () =>
    reconnectInstagramHandler({
      credentialConfig,
      workspaceId: "ws-1",
      integrationId: "ig-1",
      userToken: "ig-user-token",
    })

  test("stores the user token when the authorized account matches", async () => {
    const result = await executeReconnect()

    expect(result).toEqual({ status: "success" })
    expect(mockSubscribeInstagramWebhook).toHaveBeenCalledWith({
      igId: "me-1",
      accessToken: "ig-user-token",
      version: "v23.0",
    })
    expect(mockUpdateInstagramIntegrationAuth).toHaveBeenCalledWith({
      id: "ig-1",
      workspaceId: "ws-1",
      auth: expect.objectContaining({
        tokens: { accessToken: "ig-user-token" },
        metadata: {
          igId: "ig-user-9",
          igName: "IG Account",
          pageId: "me-1",
          version: "v23.0",
        },
      }),
      name: "IG Account",
      username: "ig_account",
      userInfo: {
        userId: "ig-user-9",
        userName: "IG Account",
        userAccessToken: "ig-user-token",
        avatar: UPLOADED_AVATAR_PATH,
      },
    })
    expect(
      mockUpdateInstagramIntegrationAuth.mock.invocationCallOrder[0],
    ).toBeLessThan(mockSubscribeInstagramWebhook.mock.invocationCallOrder[0])
  })

  test("returns accountNotFound when a different account was authorized", async () => {
    mockGetInstagramAccount.mockResolvedValue({
      id: "me-2",
      userId: "someone-else",
      name: "Other",
      username: "other",
      accessToken: "ig-user-token",
    })

    const result = await executeReconnect()

    expect(result).toEqual({ status: "error", reason: "accountNotFound" })
    expect(mockUpdateInstagramIntegrationAuth).not.toHaveBeenCalled()
  })

  test("keeps the previously stored avatar when the account has no profile_picture_url", async () => {
    mockFindInstagramIntegration.mockResolvedValue({
      id: "ig-1",
      type: "instagram",
      igId: "ig-user-9",
      pageId: "me-1",
      userInfo: { avatar: "public/space/ws-1/avatars/old.jpg" },
    })
    mockGetInstagramAccount.mockResolvedValue({
      id: "me-1",
      userId: "ig-user-9",
      name: "IG Account",
      username: "ig_account",
      accessToken: "ig-user-token",
    })

    const result = await executeReconnect()

    expect(result).toEqual({ status: "success" })
    expect(
      mockUpdateInstagramIntegrationAuth.mock.calls[0][0].userInfo,
    ).toEqual({
      userId: "ig-user-9",
      userName: "IG Account",
      userAccessToken: "ig-user-token",
      avatar: "public/space/ws-1/avatars/old.jpg",
    })
  })

  test("returns notFound for a facebook-login row", async () => {
    mockFindInstagramIntegration.mockResolvedValue({
      id: "ig-1",
      type: "facebook",
      igId: "ig-user-9",
      pageId: "me-1",
    })

    const result = await executeReconnect()

    expect(result).toEqual({ status: "error", reason: "notFound" })
    expect(mockGetInstagramAccount).not.toHaveBeenCalled()
  })
})

describe("reconnectInstagramFacebookHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindInstagramIntegration.mockResolvedValue({
      id: "ig-1",
      type: "facebook",
      igId: "ig-biz-9",
      pageId: "old-page",
    })
    mockGetInstagramFacebookUser.mockResolvedValue({
      id: "fb-user-1",
      name: "FB User",
      avatarUrl: "https://fb.example/avatar.jpg",
    })
    stubLookupIntegrationUserInfo()
    mockGetUserInstagramAccounts.mockResolvedValue([
      {
        id: "ig-biz-9",
        name: "IG Business",
        username: "ig_business",
        pageId: "new-page",
        pageAccessToken: "page-access-token",
      },
    ])
  })

  const executeReconnect = () =>
    reconnectInstagramFacebookHandler({
      credentialConfig,
      workspaceId: "ws-1",
      integrationId: "ig-1",
      userToken: "fb-user-token",
    })

  test("stores the page access token and refreshes a re-linked pageId", async () => {
    const result = await executeReconnect()

    expect(result).toEqual({ status: "success" })
    expect(mockSubscribeInstagramFacebookWebhook).toHaveBeenCalledWith({
      pageId: "new-page",
      accessToken: "page-access-token",
      version: "v23.0",
    })
    expect(mockUpdateInstagramIntegrationAuth).toHaveBeenCalledWith({
      id: "ig-1",
      workspaceId: "ws-1",
      auth: expect.objectContaining({
        tokens: { accessToken: "page-access-token" },
        metadata: {
          igId: "ig-biz-9",
          igName: "IG Business",
          pageId: "new-page",
          version: "v23.0",
        },
      }),
      name: "IG Business",
      username: "ig_business",
      pageId: "new-page",
      userInfo: {
        userId: "fb-user-1",
        userName: "FB User",
        userAccessToken: "fb-user-token",
        avatar: UPLOADED_AVATAR_PATH,
      },
    })
    expect(
      mockUpdateInstagramIntegrationAuth.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockSubscribeInstagramFacebookWebhook.mock.invocationCallOrder[0],
    )
  })

  test("keeps the previously stored avatar when the refreshed identity has no avatarUrl", async () => {
    mockFindInstagramIntegration.mockResolvedValue({
      id: "ig-1",
      type: "facebook",
      igId: "ig-biz-9",
      pageId: "old-page",
      userInfo: { avatar: "public/space/ws-1/avatars/old.jpg" },
    })
    mockGetInstagramFacebookUser.mockResolvedValue({
      id: "fb-user-1",
      name: "FB User",
    })

    const result = await executeReconnect()

    expect(result).toEqual({ status: "success" })
    expect(
      mockUpdateInstagramIntegrationAuth.mock.calls[0][0].userInfo,
    ).toEqual({
      userId: "fb-user-1",
      userName: "FB User",
      userAccessToken: "fb-user-token",
      avatar: "public/space/ws-1/avatars/old.jpg",
    })
  })

  test("returns accountNotFound when the stored account is not among the user's pages", async () => {
    mockGetUserInstagramAccounts.mockResolvedValue([
      {
        id: "other-account",
        name: "Other",
        username: "other",
        pageId: "page-x",
        pageAccessToken: "token-x",
      },
    ])

    const result = await executeReconnect()

    expect(result).toEqual({ status: "error", reason: "accountNotFound" })
    expect(mockUpdateInstagramIntegrationAuth).not.toHaveBeenCalled()
  })

  test("returns notFound for a direct-login row", async () => {
    mockFindInstagramIntegration.mockResolvedValue({
      id: "ig-1",
      type: "instagram",
      igId: "ig-biz-9",
      pageId: "old-page",
    })

    const result = await executeReconnect()

    expect(result).toEqual({ status: "error", reason: "notFound" })
    expect(mockGetUserInstagramAccounts).not.toHaveBeenCalled()
  })
})
