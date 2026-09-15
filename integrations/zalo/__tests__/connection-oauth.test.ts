import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type * as ZaloAuthApi from "../src/api/auth"
import { integration } from "../src/integration"

const mocks = vi.hoisted(() => ({
  convertCodeToTokens: vi.fn(),
  getZaloOAProfile: vi.fn(),
}))

vi.mock("../src/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof ZaloAuthApi>()
  return {
    ...actual,
    convertCodeToTokens: mocks.convertCodeToTokens,
    getZaloOAProfile: mocks.getZaloOAProfile,
  }
})

const credential = {
  clientId: "app-1",
  clientSecret: "secret-1",
  redirectUrl: "",
  version: "v4",
}

describe("Zalo connection.authorizeUrl", () => {
  test("passes state through verbatim, not JSON/base64-wrapped", () => {
    const url = integration.connection.authorizeUrl?.({
      credential,
      callbackUrl: "https://app.example.test/integrations/zalo/callback",
      state: "session-1.abc123",
    })
    const parsed = new URL(url as string)

    expect(parsed.searchParams.get("state")).toBe("session-1.abc123")
    expect(parsed.searchParams.get("app_id")).toBe("app-1")
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/integrations/zalo/callback",
    )
    expect(parsed.origin).toBe("https://oauth.zaloapp.com")
    expect(parsed.pathname).toBe("/v4/oa/permission")
  })
})

describe("Zalo connection.exchangeCode", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"))
    vi.clearAllMocks()
    mocks.convertCodeToTokens.mockResolvedValue({
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_in: 3600,
    })
    mocks.getZaloOAProfile.mockResolvedValue({
      oa_id: "oa-1",
      name: "Zalo Official Account",
      description: "",
      avatar: "",
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("exchanges the code and returns the complete Zalo account auth", async () => {
    const callbackUrl = "https://app.example.test/integrations/zalo/callback"

    const auth = await integration.connection.exchangeCode?.({
      code: "auth-code",
      callbackUrl,
      credential,
    })

    expect(mocks.convertCodeToTokens).toHaveBeenCalledWith(
      { ...credential, redirectUrl: callbackUrl },
      "auth-code",
    )
    expect(mocks.getZaloOAProfile).toHaveBeenCalledWith("access-1")
    expect(auth).toEqual({
      authType: "oauth2",
      clientId: "app-1",
      clientSecret: "secret-1",
      redirectUrl: callbackUrl,
      version: "v4",
      tokens: {
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresAt: "2026-09-15T13:00:00.000Z",
      },
      oaId: "oa-1",
      metadata: {
        version: "v4",
        oaName: "Zalo Official Account",
      },
    })
  })
})
