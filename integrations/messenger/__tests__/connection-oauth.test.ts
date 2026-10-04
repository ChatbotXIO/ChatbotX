import {
  expectStateVerbatim,
  facebookOauthCredential,
} from "@chatbotx.io/vitest-config/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { MessengerException } from "../src/exception"

const mocks = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  exchangeLongLivedToken: vi.fn(),
  getUserPages: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("../src/apis/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/apis/auth")>()
  return {
    ...actual,
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    getUserPages: mocks.getUserPages,
  }
})

vi.mock("../src/apis/page", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/apis/page")>()
  return {
    ...actual,
    exchangeLongLivedToken: mocks.exchangeLongLivedToken,
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

const { integration } = await import("../src/integration")

const credential = {
  ...facebookOauthCredential,
  stateParams: { workspaceId: "workspace-1" },
}

describe("Messenger connection.authorizeUrl", () => {
  test("passes state through verbatim, not JSON/base64-wrapped", () => {
    const url = integration.connection.authorizeUrl?.({
      credential,
      callbackUrl: "https://app.example.test/integrations/messenger/callback",
      state: "session-1.abc123",
    })
    const parsed = new URL(url as string)
    expectStateVerbatim(url, "session-1.abc123")
    expect(parsed.searchParams.get("client_id")).toBe("client-1")
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/integrations/messenger/callback",
    )
    expect(parsed.hostname).toBe("www.facebook.com")
  })
})

describe("Messenger connection.exchangeCode", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.exchangeCodeForToken.mockResolvedValue("short-lived-token")
    mocks.exchangeLongLivedToken.mockResolvedValue("long-lived-token")
  })

  test("returns a user-level oauth2 AuthValue with no page metadata yet", async () => {
    const auth = await integration.connection.exchangeCode?.({
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential,
    })
    expect(auth).toEqual({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: "https://app.example.test/callback",
      version: "v23.0",
      tokens: { accessToken: "long-lived-token" },
    })
  })

  test("rejects a failed long-lived token exchange", async () => {
    mocks.exchangeLongLivedToken.mockRejectedValueOnce(new Error("boom"))

    await expect(
      integration.connection.exchangeCode?.({
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential,
      }),
    ).rejects.toThrow("boom")
  })
})

describe("Messenger refreshAuth", () => {
  test("preserves a revoked provider error for connection revocation detection", async () => {
    const refreshAuth = integration.refreshAuth
    if (!refreshAuth) {
      throw new Error("Messenger integration must define refreshAuth")
    }
    const revokedError = new MessengerException(
      "Token revoked",
      400,
      190,
      467,
      "OAuthException",
    )
    mocks.exchangeLongLivedToken.mockRejectedValueOnce(revokedError)

    await expect(
      refreshAuth({
        auth: {
          authType: "oauth2",
          clientId: "client-1",
          clientSecret: "secret-1",
          redirectUrl: "https://app.example.test/callback",
          tokens: { accessToken: "expired-access-token" },
          metadata: {
            pageId: "page-1",
            pageName: "Page One",
            version: "v23.0",
          },
        },
      }),
    ).rejects.toBe(revokedError)
    expect(integration.connection.isRevokedTokenError?.(revokedError)).toBe(
      true,
    )
  })
})

describe("Messenger connection.listCandidates", () => {
  const userAuth = {
    authType: "oauth2" as const,
    clientId: "client-1",
    clientSecret: "secret-1",
    redirectUrl: facebookOauthCredential.redirectUrl,
    version: "v23.0",
    tokens: { accessToken: "user-token" },
  }

  test("returns one candidate per connectable page, carrying that page's own access token", async () => {
    mocks.getUserPages.mockResolvedValue({
      pages: [
        {
          id: "page-1",
          name: "Page One",
          isConnectable: true,
          access_token: "page-1-token",
        },
        {
          id: "page-2",
          name: "Page Two",
          isConnectable: false,
          access_token: "page-2-token",
        },
        { id: "page-3", name: "Page Three", isConnectable: true },
      ],
      bmLookupFailed: false,
    })

    const candidates = await integration.connection.listCandidates?.({
      auth: userAuth,
    })

    expect(mocks.getUserPages).toHaveBeenCalledWith("user-token", "v23.0")
    expect(candidates).toEqual([
      {
        sourceId: "page-1",
        displayName: "Page One",
        auth: {
          authType: "oauth2",
          clientId: "client-1",
          clientSecret: "secret-1",
          redirectUrl: facebookOauthCredential.redirectUrl,
          version: "v23.0",
          tokens: { accessToken: "page-1-token" },
          metadata: {
            pageId: "page-1",
            pageName: "Page One",
            version: "v23.0",
          },
        },
      },
    ])
  })

  test("returns no candidates for a non-oauth2 auth value", async () => {
    const candidates = await integration.connection.listCandidates?.({
      auth: { authType: "none" },
    })
    expect(candidates).toEqual([])
    expect(mocks.getUserPages).not.toHaveBeenCalled()
  })
})

describe("Messenger connection.describe", () => {
  test("uses the page metadata for candidate-level auth (initial connect)", () => {
    const descriptor = integration.connection.describe({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: facebookOauthCredential.redirectUrl,
      version: "v23.0",
      tokens: { accessToken: "page-1-token" },
      metadata: { pageId: "page-1", pageName: "Page One", version: "v23.0" },
    })
    expect(descriptor).toEqual({
      sourceId: "page-1",
      displayName: "Page One",
    })
  })

  test("rejects user-level auth without a stable page identity", () => {
    const userLevelAuth = {
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: facebookOauthCredential.redirectUrl,
      version: "v23.0",
      tokens: { accessToken: "user-token" },
    }
    expect(() =>
      integration.connection.describe(
        userLevelAuth as Parameters<typeof integration.connection.describe>[0],
      ),
    ).toThrow("Messenger auth has no page identity")
  })
})
