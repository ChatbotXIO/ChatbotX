// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindMessengerIntegration,
  mockUpdateMessengerIntegrationAuth,
  mockFindInstagramIntegration,
  mockUpdateInstagramIntegrationAuth,
  mockExchangeMessengerCode,
  mockGetUserPages,
  mockExchangeMessengerLongLivedToken,
  mockSubscribePageToAppWebhook,
  mockGetInstagramAccount,
  mockSubscribeInstagramWebhook,
  mockGetUserInstagramAccounts,
  mockSubscribeInstagramFacebookWebhook,
} = vi.hoisted(() => ({
  mockFindMessengerIntegration: vi.fn(),
  mockUpdateMessengerIntegrationAuth: vi.fn(),
  mockFindInstagramIntegration: vi.fn(),
  mockUpdateInstagramIntegrationAuth: vi.fn(),
  mockExchangeMessengerCode: vi.fn(),
  mockGetUserPages: vi.fn(),
  mockExchangeMessengerLongLivedToken: vi.fn(),
  mockSubscribePageToAppWebhook: vi.fn(),
  mockGetInstagramAccount: vi.fn(),
  mockSubscribeInstagramWebhook: vi.fn(),
  mockGetUserInstagramAccounts: vi.fn(),
  mockSubscribeInstagramFacebookWebhook: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  findMessengerIntegrationByIdForWorkspace: mockFindMessengerIntegration,
  updateMessengerIntegrationAuth: mockUpdateMessengerIntegrationAuth,
  findInstagramIntegrationByIdForWorkspace: mockFindInstagramIntegration,
  updateInstagramIntegrationAuth: mockUpdateInstagramIntegrationAuth,
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  exchangeCodeForToken: mockExchangeMessengerCode,
  getUserPages: mockGetUserPages,
}))

vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  exchangeLongLivedToken: mockExchangeMessengerLongLivedToken,
  subscribePageToAppWebhook: mockSubscribePageToAppWebhook,
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  getInstagramAccount: mockGetInstagramAccount,
  subscribePageToInstagramWebhook: mockSubscribeInstagramWebhook,
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  getUserInstagramAccounts: mockGetUserInstagramAccounts,
  subscribePageToInstagramWebhook: mockSubscribeInstagramFacebookWebhook,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { oauth2: "oauth2" },
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

describe("reconnectMessengerHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMessengerIntegration.mockResolvedValue({
      id: "im-1",
      pageId: "page-1",
    })
    mockExchangeMessengerCode.mockResolvedValue("short-token")
    mockExchangeMessengerLongLivedToken.mockImplementation(
      async (_config: unknown, token: string) => `long-${token}`,
    )
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
    })
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
    })
    // DB write must land before the webhook subscription so a failed write
    // never leaves the webhook re-bound to a token the row doesn't hold.
    expect(
      mockUpdateMessengerIntegrationAuth.mock.invocationCallOrder[0],
    ).toBeLessThan(mockSubscribePageToAppWebhook.mock.invocationCallOrder[0])
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
    })
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
    })
    expect(
      mockUpdateInstagramIntegrationAuth.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockSubscribeInstagramFacebookWebhook.mock.invocationCallOrder[0],
    )
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
