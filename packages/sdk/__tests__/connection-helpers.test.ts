import { describe, expect, test, vi } from "vitest"
import {
  AuthType,
  apiKeyConnection,
  buildFacebookDialogUrl,
  googleOAuthConnection,
  googleTokensToAuth,
  isUnauthorizedStatusError,
  oauth2Auth,
  probeVerify,
  selfServeConnection,
  verifyGraphToken,
} from "../src"

describe("probeVerify", () => {
  test("maps provider failures to stable health results", async () => {
    const failure = new Error("credential rejected")

    await expect(
      probeVerify(() => Promise.reject(failure), {
        label: "fixture",
        isRevoked: (error) => error === failure,
      }),
    ).resolves.toEqual({
      ok: false,
      revoked: true,
      error: "credential rejected",
    })
  })
})

describe("apiKeyConnection", () => {
  test("builds auth, probes exactly once, and returns the built auth", async () => {
    const auth = { authType: AuthType.custom as const, apiKey: "key" }
    const buildAuth = vi.fn(async () => auth)
    const probe = vi.fn(async () => undefined)
    const connection = apiKeyConnection({
      integrationKey: "fixture",
      displayName: "Fixture",
      buildAuth,
      probe,
    })

    const result = await connection.fromCredentials?.({ apiKey: " key " })

    expect(buildAuth).toHaveBeenCalledWith({ apiKey: " key " })
    expect(probe).toHaveBeenCalledExactlyOnceWith(auth)
    expect(result).toBe(auth)
  })

  test("verify reports a revoked probe failure instead of throwing", async () => {
    const failure = new Error("invalid key")
    const connection = apiKeyConnection({
      integrationKey: "fixture",
      displayName: "Fixture",
      buildAuth: async () => ({ authType: AuthType.custom as const }),
      probe: () => Promise.reject(failure),
      isRevoked: (error) => error === failure,
    })

    await expect(
      connection.verify({ auth: { authType: AuthType.custom } }),
    ).resolves.toEqual({ ok: false, revoked: true, error: "invalid key" })
  })
})

describe("OAuth helpers", () => {
  test("oauth2Auth preserves provider settings and uses the exchange callback", () => {
    expect(
      oauth2Auth(
        {
          clientId: "client-1",
          clientSecret: "secret-1",
          verifyToken: "verify-1",
          version: "v23.0",
        },
        "https://app.test/callback",
        { accessToken: "access-1" },
      ),
    ).toEqual({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: "https://app.test/callback",
      verifyToken: "verify-1",
      version: "v23.0",
      tokens: { accessToken: "access-1" },
    })
  })

  test("googleOAuthConnection passes state and maps exchanged tokens", async () => {
    const generateAuthUrl = vi.fn(() => "https://accounts.test/authorize")
    const getToken = vi.fn(async () => ({
      tokens: {
        access_token: "access-1",
        expiry_date: 1_700_000_000_000,
        refresh_token: "refresh-1",
        scope: "scope-1",
      },
    }))
    const getClient = vi.fn(() => ({ generateAuthUrl, getToken }))
    const connection = googleOAuthConnection({
      getClient,
      scopes: ["scope-1"],
    })
    const credential = {
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: "https://legacy.test/callback",
    }

    expect(
      connection.authorizeUrl({
        credential,
        callbackUrl: "https://app.test/callback",
        state: "session-1.nonce-1",
      }),
    ).toBe("https://accounts.test/authorize")
    expect(generateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      prompt: "consent",
      scope: ["scope-1"],
      state: "session-1.nonce-1",
    })

    await expect(
      connection.exchangeCode({
        code: "code-1",
        callbackUrl: "https://app.test/callback",
        credential,
      }),
    ).resolves.toEqual({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: "https://app.test/callback",
      tokens: {
        accessToken: "access-1",
        expiresAt: "2023-11-14T22:13:20.000Z",
        refreshToken: "refresh-1",
      },
      metadata: { scope: "scope-1" },
    })
  })

  test("googleTokensToAuth handles absent expiry without constructing an invalid date", () => {
    const auth = googleTokensToAuth(
      {
        clientId: "client-1",
        clientSecret: "secret-1",
        redirectUrl: "https://legacy.test/callback",
      },
      "https://app.test/callback",
      { access_token: "access-1", refresh_token: "refresh-1" },
    )

    expect(auth.tokens.expiresAt).toBeUndefined()
    expect(auth.redirectUrl).toBe("https://app.test/callback")
  })

  test("googleTokensToAuth rejects a callback response without a refresh token", () => {
    expect(() =>
      googleTokensToAuth(
        {
          clientId: "client-1",
          clientSecret: "secret-1",
          redirectUrl: "https://legacy.test/callback",
        },
        "https://app.test/callback",
        { access_token: "access-1" },
      ),
    ).toThrow("Google OAuth response has no refresh token")
  })
  test("googleTokensToAuth rejects a callback response without an access token", () => {
    expect(() =>
      googleTokensToAuth(
        {
          clientId: "client-1",
          clientSecret: "secret-1",
          redirectUrl: "https://legacy.test/callback",
        },
        "https://app.test/callback",
        { refresh_token: "refresh-1" },
      ),
    ).toThrow("Google OAuth response has no access token")
  })
})

describe("Meta helpers", () => {
  test("buildFacebookDialogUrl keeps state verbatim", () => {
    const url = new URL(
      buildFacebookDialogUrl({
        clientId: "client-1",
        callbackUrl: "https://app.test/callback",
        scopes: ["pages_show_list"],
        state: "session-1.nonce-1",
        version: "v23.0",
        authType: "rerequest",
      }),
    )

    expect(url.searchParams.get("state")).toBe("session-1.nonce-1")
    expect(url.searchParams.get("auth_type")).toBe("rerequest")
  })

  test("verifyGraphToken maps invalid debug results to revoked health", async () => {
    const debugToken = vi.fn(async () => ({ is_valid: false }))
    const verify = verifyGraphToken({ label: "Meta", debugToken })

    await expect(
      verify({
        auth: {
          clientId: "client-1",
          clientSecret: "secret-1",
          tokens: { accessToken: "access-1" },
          metadata: { version: "v23.0" },
        },
      }),
    ).resolves.toEqual({
      ok: false,
      revoked: true,
      error: "Meta access token is invalid",
    })
    expect(debugToken).toHaveBeenCalledWith({
      inputToken: "access-1",
      appAccessToken: "client-1|secret-1",
      version: "v23.0",
    })
  })
})

describe("selfServeConnection", () => {
  test("uses workspace identity and reports healthy", async () => {
    const connection = selfServeConnection({
      displayName: "Built-in",
      multiAccount: false,
    })

    expect(connection.describe({ authType: AuthType.none })).toEqual({
      sourceId: "workspace",
      displayName: "Built-in",
    })
    await expect(
      connection.verify({ auth: { authType: AuthType.none } }),
    ).resolves.toEqual({ ok: true })
  })
})

describe("isUnauthorizedStatusError", () => {
  test("matches only unauthorized status errors", () => {
    expect(isUnauthorizedStatusError({ statusCode: 401 })).toBe(true)
    expect(isUnauthorizedStatusError({ statusCode: 403 })).toBe(false)
    expect(isUnauthorizedStatusError({ statusCode: 500 })).toBe(false)
    expect(isUnauthorizedStatusError(new Error("boom"))).toBe(false)
  })
})
