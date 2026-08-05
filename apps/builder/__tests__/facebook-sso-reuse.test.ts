// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const REQUIRED_SCOPES = ["pages_show_list", "pages_messaging"]

const {
  mockDebugToken,
  mockFindByUserAndProvider,
  mockGetFacebookUser,
  mockToAppAccessToken,
} = vi.hoisted(() => ({
  mockDebugToken: vi.fn(),
  mockFindByUserAndProvider: vi.fn(),
  mockGetFacebookUser: vi.fn(),
  mockToAppAccessToken: vi.fn(() => "client-id|client-secret"),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  authAccountRepository: { findByUserAndProvider: mockFindByUserAndProvider },
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  debugToken: mockDebugToken,
  getFacebookUser: mockGetFacebookUser,
  MESSENGER_REUSE_REQUIRED_SCOPES: REQUIRED_SCOPES,
  toAppAccessToken: mockToAppAccessToken,
}))

const { tryReuseFacebookSsoToken } = await import(
  "@/features/integration-messenger/libs/sso-reuse"
)

const messengerCredential = {
  clientId: "client-id",
  clientSecret: "client-secret",
  version: "v23.0",
}

describe("tryReuseFacebookSsoToken", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("no linked Facebook account is not reusable", async () => {
    mockFindByUserAndProvider.mockResolvedValue(null)

    const result = await tryReuseFacebookSsoToken({
      userId: "user-1",
      messengerCredential,
    })

    expect(result).toEqual({ reusable: false })
    expect(mockDebugToken).not.toHaveBeenCalled()
  })

  test("an invalid token (revoked, or rotated app secret) is not reusable", async () => {
    mockFindByUserAndProvider.mockResolvedValue({ accessToken: "fb-token" })
    mockDebugToken.mockResolvedValue({ is_valid: false, scopes: [] })

    const result = await tryReuseFacebookSsoToken({
      userId: "user-1",
      messengerCredential,
    })

    expect(result).toEqual({ reusable: false })
  })

  test("debugToken rejecting (e.g. app secret rotated) is not reusable", async () => {
    mockFindByUserAndProvider.mockResolvedValue({ accessToken: "fb-token" })
    mockDebugToken.mockRejectedValue(new Error("(#100) token not for this app"))

    const result = await tryReuseFacebookSsoToken({
      userId: "user-1",
      messengerCredential,
    })

    expect(result).toEqual({ reusable: false })
  })

  test("a valid token missing a required scope is not reusable", async () => {
    mockFindByUserAndProvider.mockResolvedValue({ accessToken: "fb-token" })
    mockDebugToken.mockResolvedValue({
      is_valid: true,
      scopes: ["pages_show_list"], // missing pages_messaging
    })

    const result = await tryReuseFacebookSsoToken({
      userId: "user-1",
      messengerCredential,
    })

    expect(result).toEqual({ reusable: false })
    expect(mockGetFacebookUser).not.toHaveBeenCalled()
  })

  test("a valid token carrying every required scope is reusable", async () => {
    mockFindByUserAndProvider.mockResolvedValue({ accessToken: "fb-token" })
    mockDebugToken.mockResolvedValue({
      is_valid: true,
      scopes: REQUIRED_SCOPES,
    })
    mockGetFacebookUser.mockResolvedValue({
      id: "fb-1",
      name: "Jane Doe",
      avatarUrl: "https://example.com/avatar.png",
    })

    const result = await tryReuseFacebookSsoToken({
      userId: "user-1",
      messengerCredential,
    })

    expect(result).toEqual({
      reusable: true,
      userToken: "fb-token",
      userId: "fb-1",
      userName: "Jane Doe",
      userAvatarUrl: "https://example.com/avatar.png",
    })
    expect(mockDebugToken).toHaveBeenCalledWith({
      inputToken: "fb-token",
      appAccessToken: "client-id|client-secret",
      version: "v23.0",
    })
  })

  test("a failed profile lookup still reports reusable (best-effort)", async () => {
    mockFindByUserAndProvider.mockResolvedValue({ accessToken: "fb-token" })
    mockDebugToken.mockResolvedValue({
      is_valid: true,
      scopes: REQUIRED_SCOPES,
    })
    mockGetFacebookUser.mockRejectedValue(new Error("network error"))

    const result = await tryReuseFacebookSsoToken({
      userId: "user-1",
      messengerCredential,
    })

    expect(result).toEqual({
      reusable: true,
      userToken: "fb-token",
      userId: undefined,
      userName: undefined,
      userAvatarUrl: undefined,
    })
  })
})
