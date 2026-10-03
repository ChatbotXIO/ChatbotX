import { beforeEach, describe, expect, test, vi } from "vitest"
import { expectStateVerbatim, oauthCredential } from "./test-utils"

const mocks = vi.hoisted(() => ({
  generateAuthUrl: vi.fn(),
  getAccessToken: vi.fn(),
  getClient: vi.fn(),
  getToken: vi.fn(),
  getTokenInfo: vi.fn(),
}))

vi.mock("../src/client", () => ({
  generateAuthUrl: vi.fn(),
  getClient: mocks.getClient,
  getSheetsClient: vi.fn(),
}))

// Import after mocks so the integration captures the mocked OAuth client.
const { integration } = await import("../src/integration")
const { callbackHandler } = await import("../src/handlers/callback")

const credential = oauthCredential

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getClient.mockReturnValue({
    generateAuthUrl: mocks.generateAuthUrl,
    getAccessToken: mocks.getAccessToken,
    getToken: mocks.getToken,
    getTokenInfo: mocks.getTokenInfo,
  })
  mocks.generateAuthUrl.mockImplementation((options: { state?: string }) => {
    const params = new URLSearchParams({ state: options.state ?? "" })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  })
  mocks.getToken.mockResolvedValue({
    tokens: {
      access_token: "access-token",
      expiry_date: 1_789_744_000_000,
      refresh_token: "refresh-token",
      scope: "https://www.googleapis.com/auth/spreadsheets",
    },
  })
  mocks.getTokenInfo.mockResolvedValue({
    sub: "google-account-1",
    email: "owner@example.test",
  })
  mocks.getAccessToken.mockResolvedValue({ token: "access-token" })
})

describe("Google Sheets connection.authorizeUrl", () => {
  test("passes state through verbatim, not JSON/base64-wrapped", () => {
    const url = integration.connection.authorizeUrl?.({
      credential,
      callbackUrl:
        "https://app.example.test/integrations/google-sheets/callback",
      state: "session-1.abc123",
    })
    expectStateVerbatim(url, "session-1.abc123")

    expect(mocks.getClient).toHaveBeenCalledWith({
      ...credential,
      redirectUrl:
        "https://app.example.test/integrations/google-sheets/callback",
    })
    expect(mocks.generateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/spreadsheets",
        "openid",
        "email",
      ],
      state: "session-1.abc123",
    })
  })
})

describe("Google Sheets connection.exchangeCode", () => {
  test("exchanges the code and returns the complete Sheets auth", async () => {
    const auth = await integration.connection.exchangeCode?.({
      code: "auth-code",
      callbackUrl:
        "https://app.example.test/integrations/google-sheets/callback",
      credential,
    })

    expect(mocks.getClient).toHaveBeenCalledWith({
      ...credential,
      redirectUrl:
        "https://app.example.test/integrations/google-sheets/callback",
    })
    expect(mocks.getToken).toHaveBeenCalledWith("auth-code")
    expect(mocks.getTokenInfo).toHaveBeenCalledWith("access-token")
    expect(auth).toEqual({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl:
        "https://app.example.test/integrations/google-sheets/callback",
      tokens: {
        accessToken: "access-token",
        expiresAt: "2026-09-18T15:06:40.000Z",
        refreshToken: "refresh-token",
      },
      metadata: {
        scope: "https://www.googleapis.com/auth/spreadsheets",
        accountId: "google-account-1",
        email: "owner@example.test",
      },
    })
  })

  test("rejects an exchange without a stable Google account id", async () => {
    mocks.getTokenInfo.mockResolvedValueOnce({})

    await expect(
      integration.connection.exchangeCode?.({
        code: "auth-code",
        callbackUrl:
          "https://app.example.test/integrations/google-sheets/callback",
        credential,
      }),
    ).rejects.toThrow("Google Sheets token info has no stable account id")
  })
})

describe("Google Sheets connection.verify", () => {
  const auth = {
    authType: "oauth2" as const,
    clientId: "client-1",
    clientSecret: "secret-1",
    redirectUrl: "https://app.example.test/connections/callback",
    tokens: { accessToken: "access-token" },
    metadata: { accountId: "google-account-1" },
  }

  test.each([
    ["an unauthorized response", new Error("Unauthorized"), 401],
    ["an invalid_grant response", new Error("invalid_grant"), 400],
  ])("treats %s as revoked", async (_label, error, status) => {
    mocks.getTokenInfo.mockRejectedValue(
      Object.assign(error, { response: { status } }),
    )

    await expect(
      integration.connection.verify({ auth }),
    ).resolves.toMatchObject({
      ok: false,
      revoked: true,
    })
  })

  test("does not treat a provider 5xx as revoked", async () => {
    mocks.getTokenInfo.mockRejectedValue(
      Object.assign(new Error("upstream failure"), {
        response: { status: 503 },
      }),
    )

    await expect(
      integration.connection.verify({ auth }),
    ).resolves.toMatchObject({
      ok: false,
      revoked: false,
    })
  })
})

describe("Google Sheets connection.describe", () => {
  test("uses the immutable Google account id as the connection identity", () => {
    const descriptor = integration.connection.describe({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl:
        "https://app.example.test/integrations/google-sheets/callback",
      tokens: { accessToken: "access-token" },
      metadata: {
        accountId: "google-account-1",
        email: "owner@example.test",
      },
    })

    expect(descriptor).toMatchObject({
      sourceId: "google-account-1",
      displayName: "owner@example.test",
    })
  })
})

describe("Google Sheets legacy callback", () => {
  test("handles missing expiry and stores the same stable account identity", async () => {
    mocks.getToken.mockResolvedValueOnce({
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token",
        scope: "https://www.googleapis.com/auth/spreadsheets",
      },
    })

    const auth = await callbackHandler({
      req: new Request("https://app.example.test/callback?code=auth-code"),
      config: credential,
    } as never)

    expect(auth.tokens.expiresAt).toBeUndefined()
    expect(auth.metadata).toMatchObject({
      accountId: "google-account-1",
      email: "owner@example.test",
    })
  })
})
