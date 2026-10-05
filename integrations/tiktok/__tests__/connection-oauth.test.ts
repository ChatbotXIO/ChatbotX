import {
  expectStateVerbatim,
  oauthCredential,
} from "@chatbotx.io/vitest-config/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { TiktokAPIException, TiktokMissingScopesError } from "../src/exception"
import {
  TIKTOK_COMMENT_AUTOMATION_SCOPES,
  TIKTOK_CORE_SCOPES,
  TIKTOK_OPTIONAL_PROFILE_SCOPES,
} from "../src/lib/scopes"

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getUserInfo: vi.fn(),
  refreshAccessToken: vi.fn(),
}))

vi.mock("../src/apis/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/apis/auth")>()
  return {
    ...actual,
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    refreshAccessToken: mocks.refreshAccessToken,
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

const credential = oauthCredential

describe("TikTok connection.authorizeUrl", () => {
  test("passes state through verbatim, not JSON/base64-wrapped", () => {
    const url = integration.connection.authorizeUrl?.({
      credential,
      callbackUrl: "https://app.example.test/integrations/tiktok/callback",
      state: "session-1.abc123",
    })
    const parsed = new URL(url as string)
    expectStateVerbatim(url, "session-1.abc123")

    expect(parsed.searchParams.get("client_key")).toBe("client-1")
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/integrations/tiktok/callback",
    )
    expect(parsed.searchParams.get("disable_auto_auth")).toBe("1")
    expect(parsed.searchParams.get("scope")?.split(",")).toEqual([
      ...TIKTOK_CORE_SCOPES,
      ...TIKTOK_OPTIONAL_PROFILE_SCOPES,
      ...TIKTOK_COMMENT_AUTOMATION_SCOPES,
    ])
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
      scope: [
        ...TIKTOK_CORE_SCOPES,
        ...TIKTOK_OPTIONAL_PROFILE_SCOPES,
        ...TIKTOK_COMMENT_AUTOMATION_SCOPES,
      ].join(","),
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
      redirectUrl: "https://app.example.test/callback",
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
        scopes: [
          ...TIKTOK_CORE_SCOPES,
          ...TIKTOK_OPTIONAL_PROFILE_SCOPES,
          ...TIKTOK_COMMENT_AUTOMATION_SCOPES,
        ],
      },
    })
  })

  test("refuses a code exchange missing a core messaging scope", async () => {
    mocks.exchangeCodeForToken.mockResolvedValueOnce({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      refresh_expires_in: 7200,
      open_id: "open-id-1",
      scope: TIKTOK_CORE_SCOPES.filter(
        (scope) => scope !== "message.list.send",
      ).join(","),
    })

    await expect(
      integration.connection.exchangeCode?.({
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential,
      }),
    ).rejects.toBeInstanceOf(TiktokMissingScopesError)
    expect(mocks.getUserInfo).not.toHaveBeenCalled()
  })
})

describe("TikTok refreshAuth", () => {
  test("preserves a revoked provider error for connection revocation detection", async () => {
    const refreshAuth = integration.refreshAuth
    if (!refreshAuth) {
      throw new Error("TikTok integration must define refreshAuth")
    }
    const revokedError = new TiktokAPIException("Token revoked", 401)
    mocks.refreshAccessToken.mockRejectedValueOnce(revokedError)

    await expect(
      refreshAuth({
        auth: {
          authType: "oauth2",
          clientId: "client-1",
          clientSecret: "secret-1",
          redirectUrl: "https://app.example.test/callback",
          tokens: {
            accessToken: "expired-access-token",
            refreshToken: "refresh-token",
          },
          metadata: {
            openId: "open-id-1",
            username: "tiktok-user",
            displayName: "TikTok User",
          },
        },
      }),
    ).rejects.toBe(revokedError)
    expect(integration.connection.isRevokedTokenError?.(revokedError)).toBe(
      true,
    )
  })
})
