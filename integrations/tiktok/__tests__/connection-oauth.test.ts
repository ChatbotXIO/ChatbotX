import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getUserInfo: vi.fn(),
}))

vi.mock("../src/apis/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/apis/auth")>()
  return {
    ...actual,
    exchangeCodeForToken: mocks.exchangeCodeForToken,
  }
})

vi.mock("../src/apis/user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/apis/user")>()
  return {
    ...actual,
    getUserInfo: mocks.getUserInfo,
  }
})

const { integration } = await import("../src/integration")

const credential = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "",
}

describe("TikTok connection.authorizeUrl", () => {
  test("passes state through verbatim, not JSON/base64-wrapped", () => {
    const url = integration.connection.authorizeUrl?.({
      credential,
      callbackUrl: "https://app.example.test/integrations/tiktok/callback",
      state: "session-1.abc123",
    })
    const parsed = new URL(url as string)

    expect(parsed.searchParams.get("state")).toBe("session-1.abc123")
    expect(parsed.searchParams.get("client_key")).toBe("client-1")
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/integrations/tiktok/callback",
    )
    expect(parsed.searchParams.get("disable_auto_auth")).toBe("1")
    expect(parsed.searchParams.get("scope")).toBe(
      "user.info.basic,user.info.username,user.info.profile,user.info.stats,user.account.type,message.list.read,message.list.send,message.list.manage",
    )
  })
})

describe("TikTok connection.exchangeCode", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"))
    vi.clearAllMocks()
    mocks.exchangeCodeForToken.mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      refresh_expires_in: 7200,
      open_id: "open-id-1",
    })
    mocks.getUserInfo.mockResolvedValue({
      open_id: "open-id-1",
      username: "tiktok-user",
      display_name: "TikTok User",
      avatar_url: "https://example.test/avatar.png",
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("exchanges the code and returns the complete account auth", async () => {
    const auth = await integration.connection.exchangeCode?.({
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential,
    })

    expect(mocks.exchangeCodeForToken).toHaveBeenCalledWith(
      {
        clientId: "client-1",
        clientSecret: "secret-1",
        redirectUrl: "https://app.example.test/callback",
      },
      "auth-code",
    )
    expect(mocks.getUserInfo).toHaveBeenCalledWith({
      accessToken: "access-token",
    })
    expect(auth).toEqual({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: "",
      tokens: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: "2026-09-15T13:00:00.000Z",
        refreshTokenExpiresAt: "2026-09-15T14:00:00.000Z",
      },
      metadata: {
        openId: "open-id-1",
        username: "tiktok-user",
        displayName: "TikTok User",
      },
    })
  })
})
