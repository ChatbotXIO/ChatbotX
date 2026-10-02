import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  exchangeLongLivedToken: vi.fn(),
}))

vi.mock("../src/apis/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/apis/auth")>()
  return {
    ...actual,
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    exchangeLongLivedToken: mocks.exchangeLongLivedToken,
  }
})

const { integration } = await import("../src/integration")

const connection = integration.connection
if (!connection) {
  throw new Error("Facebook Ads connection provider is not configured")
}

const credential = {
  clientId: "client-1",
  clientSecret: "secret-1",
  version: "v23.0",
}

describe("Facebook Ads connection.authorizeUrl", () => {
  test("passes state through verbatim, not JSON/base64-wrapped", () => {
    const url = connection.authorizeUrl?.({
      credential,
      callbackUrl:
        "https://app.example.test/integrations/facebook-ads/callback",
      state: "session-1.abc123",
    })
    const parsed = new URL(url as string)

    expect(parsed.searchParams.get("state")).toBe("session-1.abc123")
    expect(parsed.searchParams.get("client_id")).toBe("client-1")
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/integrations/facebook-ads/callback",
    )
    expect(parsed.searchParams.get("scope")).toBe(
      "ads_read,ads_management,pages_manage_ads,pages_read_engagement,pages_show_list",
    )
    expect(parsed.hostname).toBe("www.facebook.com")
  })
})

describe("Facebook Ads connection.exchangeCode", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.exchangeCodeForToken.mockResolvedValue("short-lived-token")
    mocks.exchangeLongLivedToken.mockResolvedValue({
      accessToken: "long-lived-token",
      expiresIn: 3600,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("exchanges short-lived code token for a complete custom AuthValue", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000)

    const auth = await connection.exchangeCode?.({
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential,
    })

    expect(mocks.exchangeCodeForToken).toHaveBeenCalledWith(
      credential,
      "auth-code",
      "https://app.example.test/callback",
    )
    expect(mocks.exchangeLongLivedToken).toHaveBeenCalledWith(
      credential,
      "short-lived-token",
    )
    expect(auth).toEqual({
      authType: "custom",
      accessToken: "long-lived-token",
      version: "v23.0",
      expiresAt: "1970-01-01T01:00:01.000Z",
    })
  })
})
