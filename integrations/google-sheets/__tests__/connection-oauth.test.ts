import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  generateAuthUrl: vi.fn(),
  getClient: vi.fn(),
  getToken: vi.fn(),
}))

vi.mock("../src/client", () => ({
  generateAuthUrl: vi.fn(),
  getClient: mocks.getClient,
  getSheetsClient: vi.fn(),
}))

// Import after mocks so the integration captures the mocked OAuth client.
const { integration } = await import("../src/integration")

const credential = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getClient.mockReturnValue({
    generateAuthUrl: mocks.generateAuthUrl,
    getToken: mocks.getToken,
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
})

describe("Google Sheets connection.authorizeUrl", () => {
  test("passes state through verbatim, not JSON/base64-wrapped", () => {
    const url = integration.connection.authorizeUrl?.({
      credential,
      callbackUrl:
        "https://app.example.test/integrations/google-sheets/callback",
      state: "session-1.abc123",
    })
    const parsed = new URL(url as string)

    expect(parsed.searchParams.get("state")).toBe("session-1.abc123")
    expect(mocks.getClient).toHaveBeenCalledWith({
      ...credential,
      redirectUrl:
        "https://app.example.test/integrations/google-sheets/callback",
    })
    expect(mocks.generateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/spreadsheets"],
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
    expect(auth).toEqual({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: "",
      tokens: {
        accessToken: "access-token",
        expiresAt: "2026-09-18T15:06:40.000Z",
        refreshToken: "refresh-token",
      },
      metadata: {
        scope: "https://www.googleapis.com/auth/spreadsheets",
      },
    })
  })
})
