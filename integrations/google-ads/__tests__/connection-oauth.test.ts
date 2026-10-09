import {
  AuthException,
  ConnectionProviderRejectedError,
} from "@chatbotx.io/sdk"
import { oauthCredential } from "@chatbotx.io/vitest-config/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type * as GoogleAdsApi from "../src/apis/google-ads"
import type * as ClientModule from "../src/client"
import { GoogleAdsException } from "../src/exception"

const mocks = vi.hoisted(() => ({
  generateAuthUrl: vi.fn(),
  getClient: vi.fn(),
  getToken: vi.fn(),
  getTokenInfo: vi.fn(),
  revokeToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  listAccessibleCustomers: vi.fn(),
  getCustomer: vi.fn(),
  listClientCustomers: vi.fn(),
}))

vi.mock("../src/client", async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>()
  return { ...actual, getClient: mocks.getClient }
})

vi.mock("../src/apis/google-ads", async (importOriginal) => {
  const actual = await importOriginal<typeof GoogleAdsApi>()
  return {
    ...actual,
    listAccessibleCustomers: mocks.listAccessibleCustomers,
    getCustomer: mocks.getCustomer,
    listClientCustomers: mocks.listClientCustomers,
  }
})

const { integration } = await import("../src/integration")

const connection = integration.connection
if (!connection) {
  throw new Error("Google Ads integration must define a connection provider")
}

const credential = { ...oauthCredential, developerToken: "dev-token" }
const baseAuth = {
  authType: "oauth2" as const,
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "https://app.example.test/connections/callback",
  tokens: { accessToken: "access", refreshToken: "refresh" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getClient.mockReturnValue({
    generateAuthUrl: mocks.generateAuthUrl,
    getToken: mocks.getToken,
    getTokenInfo: mocks.getTokenInfo,
    refreshAccessToken: mocks.refreshAccessToken,
    revokeToken: mocks.revokeToken,
  })
})

describe("Google Ads connection.authorizeUrl", () => {
  test("requests the Ads and Data Manager scopes with the state verbatim", () => {
    mocks.generateAuthUrl.mockReturnValue("https://accounts.google.com/auth")

    const url = connection.authorizeUrl?.({
      credential,
      callbackUrl: "https://app.example.test/connections/callback",
      state: "session-1.abc123",
    })

    expect(url).toBe("https://accounts.google.com/auth")
    expect(mocks.generateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/adwords",
        "https://www.googleapis.com/auth/datamanager",
        "openid",
        "email",
      ],
      state: "session-1.abc123",
    })
  })
})

describe("Google Ads connection.authorizeUrl by upload method", () => {
  test("a legacy credential requests the adwords scope only (plus identity)", () => {
    mocks.generateAuthUrl.mockReturnValue("https://accounts.google.com/auth")

    connection.authorizeUrl?.({
      credential: { ...credential, uploadMethod: "legacy" },
      callbackUrl: "https://app.example.test/connections/callback",
      state: "session-1.abc123",
    })

    expect(mocks.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: ["https://www.googleapis.com/auth/adwords", "openid", "email"],
      }),
    )
  })

  test("a credential without a method requests Data Manager", () => {
    mocks.generateAuthUrl.mockReturnValue("https://accounts.google.com/auth")

    connection.authorizeUrl?.({
      credential,
      callbackUrl: "https://app.example.test/connections/callback",
      state: "s.n",
    })

    expect(mocks.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.arrayContaining([
          "https://www.googleapis.com/auth/datamanager",
        ]),
      }),
    )
  })
})

describe("Google Ads connection.exchangeCode", () => {
  beforeEach(() => {
    mocks.getToken.mockResolvedValue({
      tokens: {
        access_token: "access",
        refresh_token: "refresh",
        expiry_date: 1_700_000_000_000,
        scope:
          "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/datamanager openid email",
      },
    })
    mocks.getTokenInfo.mockResolvedValue({ sub: "google-1", email: "a@b.test" })
  })

  test("carries the platform developer token and the Google identity", async () => {
    const auth = await connection.exchangeCode?.({
      code: "code",
      callbackUrl: "https://app.example.test/connections/callback",
      credential,
    })

    expect(auth).toMatchObject({
      tokens: { accessToken: "access", refreshToken: "refresh" },
      metadata: {
        accountId: "google-1",
        email: "a@b.test",
        developerToken: "dev-token",
      },
    })
  })

  test("records the Data Manager method on the auth", async () => {
    const auth = await connection.exchangeCode?.({
      code: "code",
      callbackUrl: "https://app.example.test/connections/callback",
      credential,
    })

    expect(auth?.metadata.uploadMethod).toBe("dataManager")
  })

  test("works without a developer token and stores none", async () => {
    const auth = await connection.exchangeCode?.({
      code: "code",
      callbackUrl: "https://app.example.test/connections/callback",
      credential: oauthCredential,
    })

    expect(auth?.metadata).toMatchObject({ accountId: "google-1" })
    expect(auth?.metadata).not.toHaveProperty("developerToken")
  })

  test("a Data Manager credential rejects a grant without the datamanager scope", async () => {
    mocks.getToken.mockResolvedValue({
      tokens: {
        access_token: "access",
        refresh_token: "refresh",
        scope: "https://www.googleapis.com/auth/adwords openid email",
      },
    })

    const failure = await connection
      .exchangeCode?.({
        code: "code",
        callbackUrl: "https://app.example.test/connections/callback",
        credential,
      })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ConnectionProviderRejectedError)
    expect((failure as ConnectionProviderRejectedError).failureCause).toBe(
      "scope_missing",
    )
  })

  test("a legacy credential accepts an adwords-only grant and records legacy", async () => {
    mocks.getToken.mockResolvedValue({
      tokens: {
        access_token: "access",
        refresh_token: "refresh",
        scope: "https://www.googleapis.com/auth/adwords openid email",
      },
    })

    const auth = await connection.exchangeCode?.({
      code: "code",
      callbackUrl: "https://app.example.test/connections/callback",
      credential: { ...credential, uploadMethod: "legacy" },
    })

    expect(auth?.metadata.uploadMethod).toBe("legacy")
  })

  test("a legacy credential still records Data Manager for a consent started under Data Manager", async () => {
    const auth = await connection.exchangeCode?.({
      code: "code",
      callbackUrl: "https://app.example.test/connections/callback",
      credential: { ...credential, uploadMethod: "legacy" },
    })

    expect(auth?.metadata.uploadMethod).toBe("dataManager")
  })

  test("a legacy credential still requires adwords", async () => {
    mocks.getToken.mockResolvedValue({
      tokens: {
        access_token: "access",
        refresh_token: "refresh",
        scope: "openid email",
      },
    })

    await expect(
      connection.exchangeCode?.({
        code: "code",
        callbackUrl: "https://app.example.test/connections/callback",
        credential: { ...credential, uploadMethod: "legacy" },
      }),
    ).rejects.toBeInstanceOf(ConnectionProviderRejectedError)
  })
})

describe("Google Ads connection.listCandidates", () => {
  const sessionAuth = {
    ...baseAuth,
    metadata: { developerToken: "dev-token", accountId: "google-1" },
  }

  const customer = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    descriptiveName: `Name ${id}`,
    manager: false,
    status: "ENABLED",
    currencyCode: "VND",
    ...overrides,
  })

  test("lists direct accounts plus the clients of accessible managers, direct access winning", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue([
      "1111111111",
      "2222222222",
    ])
    mocks.getCustomer.mockImplementation((_credentials, id: string) =>
      Promise.resolve(
        id === "1111111111" ? customer(id) : customer(id, { manager: true }),
      ),
    )
    mocks.listClientCustomers.mockResolvedValue([
      { id: "1111111111", descriptiveName: "Dup", currencyCode: "VND" },
      { id: "3333333333", descriptiveName: "Client", currencyCode: "USD" },
    ])

    const candidates = await connection.listCandidates?.({ auth: sessionAuth })

    expect(candidates?.map(({ sourceId }) => sourceId)).toEqual([
      "1111111111",
      "3333333333",
    ])
    expect(candidates?.[0].auth.metadata).toMatchObject({
      customerId: "1111111111",
      loginCustomerId: null,
    })
    expect(candidates?.[1].auth.metadata).toMatchObject({
      customerId: "3333333333",
      loginCustomerId: "2222222222",
      currencyCode: "USD",
    })
    expect(candidates?.[1].displayName).toBe("Client (333-333-3333)")
  })

  test("never puts the developer token on a candidate", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue(["1111111111"])
    mocks.getCustomer.mockResolvedValue(customer("1111111111"))

    const candidates = await connection.listCandidates?.({ auth: sessionAuth })

    expect(JSON.stringify(candidates)).not.toContain("dev-token")
  })

  test("skips disabled accounts and tolerates one unreadable account", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue([
      "1111111111",
      "2222222222",
      "3333333333",
    ])
    mocks.getCustomer.mockImplementation((_credentials, id: string) => {
      if (id === "2222222222") {
        return Promise.reject(new Error("permission denied"))
      }
      return Promise.resolve(
        customer(id, { status: id === "1111111111" ? "CANCELED" : "ENABLED" }),
      )
    })

    const candidates = await connection.listCandidates?.({ auth: sessionAuth })

    expect(candidates?.map(({ sourceId }) => sourceId)).toEqual(["3333333333"])
  })

  test("surfaces the real failure when every account lookup is rejected", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue([
      "1111111111",
      "2222222222",
    ])
    mocks.getCustomer.mockRejectedValue(
      new Error("DEVELOPER_TOKEN_NOT_APPROVED"),
    )

    await expect(
      connection.listCandidates?.({ auth: sessionAuth }),
    ).rejects.toThrow("DEVELOPER_TOKEN_NOT_APPROVED")
  })

  test.each([
    ["DEVELOPER_TOKEN_NOT_APPROVED", 403, "developer_token_not_approved"],
    ["USER_PERMISSION_DENIED", 403, "permission_denied"],
    ["SERVICE_DISABLED", 403, "api_not_enabled"],
  ])("maps a Google %s failure to the %s cause without leaking the token", async (reason, httpStatusCode, cause) => {
    mocks.listAccessibleCustomers.mockRejectedValue(
      new GoogleAdsException({
        httpStatusCode,
        reason,
        message: "request used developer token dev-token",
        details: [],
      }),
    )

    const failure = await connection
      .listCandidates?.({ auth: sessionAuth })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ConnectionProviderRejectedError)
    expect((failure as ConnectionProviderRejectedError).failureCause).toBe(
      cause,
    )
    expect((failure as Error).message).not.toContain("dev-token")
  })

  test("an AuthException while listing is reported as credentials_invalid", async () => {
    mocks.listAccessibleCustomers.mockRejectedValue(
      new AuthException("Google Ads credentials were rejected"),
    )

    const failure = await connection
      .listCandidates?.({ auth: sessionAuth })
      .catch((error: unknown) => error)

    expect((failure as ConnectionProviderRejectedError).failureCause).toBe(
      "credentials_invalid",
    )
  })

  test("NOT_ADS_USER means the Google user has no Ads account: empty list, not a fault", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue(["1111111111"])
    mocks.getCustomer.mockRejectedValue(
      new GoogleAdsException({
        httpStatusCode: 403,
        reason: "NOT_ADS_USER",
        details: [],
      }),
    )

    await expect(
      connection.listCandidates?.({ auth: sessionAuth }),
    ).resolves.toEqual([])
  })

  test("returns no candidates for a user without any Google Ads account", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue([])

    await expect(
      connection.listCandidates?.({ auth: sessionAuth }),
    ).resolves.toEqual([])
  })

  test("keeps the direct accounts when a manager's clients cannot be listed", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue([
      "1111111111",
      "2222222222",
    ])
    mocks.getCustomer.mockImplementation((_credentials, id: string) =>
      Promise.resolve(customer(id, { manager: id === "2222222222" })),
    )
    mocks.listClientCustomers.mockRejectedValue(new Error("boom"))

    const candidates = await connection.listCandidates?.({ auth: sessionAuth })

    expect(candidates?.map(({ sourceId }) => sourceId)).toEqual(["1111111111"])
  })

  test("lists accounts without a developer token", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue(["1111111111"])
    mocks.getCustomer.mockResolvedValue(customer("1111111111"))

    const candidates = await connection.listCandidates?.({
      auth: { ...baseAuth, metadata: { accountId: "google-1" } },
    })

    expect(candidates?.map(({ sourceId }) => sourceId)).toEqual(["1111111111"])
    expect(mocks.listAccessibleCustomers).toHaveBeenCalledWith({
      accessToken: "access",
      developerToken: undefined,
    })
  })

  test("keeps the connection's method on every candidate", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue(["1111111111"])
    mocks.getCustomer.mockResolvedValue(customer("1111111111"))

    const candidates = await connection.listCandidates?.({
      auth: {
        ...baseAuth,
        metadata: { accountId: "google-1", uploadMethod: "legacy" },
      },
    })

    expect(candidates?.[0].auth.metadata.uploadMethod).toBe("legacy")
  })

  test("propagates a credential failure from listing accessible customers", async () => {
    mocks.listAccessibleCustomers.mockRejectedValue(
      new AuthException("revoked"),
    )

    await expect(
      connection.listCandidates?.({ auth: sessionAuth }),
    ).rejects.toMatchObject({
      name: "ConnectionProviderRejectedError",
      failureCause: "credentials_invalid",
    })
  })
})

describe("Google Ads connection identity", () => {
  const auth = {
    ...baseAuth,
    metadata: {
      customerId: "1111111111",
      loginCustomerId: "2222222222",
      descriptiveName: "Shop",
      currencyCode: "VND",
    },
  }

  test("describe uses the customer id as the source id", () => {
    expect(connection.describe(auth)).toMatchObject({
      sourceId: "1111111111",
      displayName: "Shop",
    })
  })

  test("describe refuses an auth without a customer", () => {
    expect(() => connection.describe({ ...baseAuth, metadata: {} })).toThrow()
  })

  test("candidateToConfig mirrors the satellite config columns", () => {
    expect(connection.candidateToConfig?.(auth)).toEqual({
      customerId: "1111111111",
      loginCustomerId: "2222222222",
      descriptiveName: "Shop",
      currencyCode: "VND",
    })
    expect(
      connection.candidateToConfig?.({
        ...baseAuth,
        metadata: { customerId: "1" },
      }),
    ).toEqual({
      customerId: "1",
      loginCustomerId: null,
      descriptiveName: null,
      currencyCode: null,
    })
  })

  test("is a multi-account OAuth connection", () => {
    expect(connection.multiAccount).toBe(true)
    expect(connection.strategy).toBe("oauth_redirect")
  })
})

describe("Google Ads refreshAuth", () => {
  const refreshAuth = integration.refreshAuth
  if (!refreshAuth) {
    throw new Error("Google Ads integration must define refreshAuth")
  }
  const auth = { ...baseAuth, metadata: {} }

  test("classifies invalid_grant as a terminal authentication failure", async () => {
    mocks.refreshAccessToken.mockRejectedValue(
      Object.assign(new Error("invalid_grant"), { response: { status: 400 } }),
    )

    await expect(refreshAuth({ auth })).rejects.toBeInstanceOf(AuthException)
  })

  test("keeps the existing refresh token when Google omits it", async () => {
    mocks.refreshAccessToken.mockResolvedValue({
      credentials: { access_token: "rotated", expiry_date: 1_800_000_000_000 },
    })

    await expect(refreshAuth({ auth })).resolves.toMatchObject({
      tokens: {
        accessToken: "rotated",
        refreshToken: "refresh",
        expiresAt: "2027-01-15T08:00:00.000Z",
      },
    })
  })

  test("fails without a refresh token", async () => {
    await expect(
      refreshAuth({
        auth: { ...auth, tokens: { accessToken: "x" } },
      }),
    ).rejects.toBeInstanceOf(AuthException)
  })

  test("a transient refresh failure is not terminal", async () => {
    mocks.refreshAccessToken.mockRejectedValue(new Error("ECONNRESET"))

    const error = await refreshAuth({ auth }).catch((caught: unknown) => caught)

    expect(error).not.toBeInstanceOf(AuthException)
    expect(error).toBeInstanceOf(Error)
  })
})

describe("Google Ads refreshAuth secrecy", () => {
  const auth = { ...baseAuth, metadata: {} }

  test("neither a revoked nor a transient failure attaches the raw error", async () => {
    const raw = Object.assign(new Error("invalid_grant refresh"), {
      response: { status: 400 },
      config: { data: { refresh_token: "refresh", client_secret: "secret-1" } },
    })
    mocks.refreshAccessToken.mockRejectedValueOnce(raw)
    const revoked = await integration.refreshAuth?.({ auth }).catch((e) => e)
    expect(revoked).toBeInstanceOf(AuthException)
    expect(revoked.getOriginError()).toBeUndefined()

    mocks.refreshAccessToken.mockRejectedValueOnce(
      Object.assign(new Error("boom Bearer ya29.leaky-token"), {
        config: { data: "refresh" },
      }),
    )
    const transient = await integration.refreshAuth?.({ auth }).catch((e) => e)
    expect(transient.getOriginError()).toBeUndefined()
    expect(transient.message).not.toContain("ya29.leaky-token")
  })
})

describe("Google Ads disconnect", () => {
  const withTokens = (tokens: {
    accessToken: string
    refreshToken?: string | null
  }) => ({
    ...baseAuth,
    tokens,
    metadata: {},
  })

  test("revokes the refresh token when present", async () => {
    mocks.revokeToken.mockResolvedValue({})
    await integration.disconnect(
      withTokens({ accessToken: "a", refreshToken: "r" }),
    )
    expect(mocks.revokeToken).toHaveBeenCalledWith("r")
  })

  test("falls back to the access token without a refresh token", async () => {
    mocks.revokeToken.mockResolvedValue({})
    await integration.disconnect(withTokens({ accessToken: "a" }))
    expect(mocks.revokeToken).toHaveBeenCalledWith("a")
  })

  test.each([
    "invalid_token",
    "invalid_grant",
  ])("an already-invalid token (%s) is not fatal", async (code) => {
    mocks.revokeToken.mockRejectedValue(
      Object.assign(new Error(code), { response: { status: 400 } }),
    )
    await expect(
      integration.disconnect(withTokens({ accessToken: "a" })),
    ).resolves.toBeUndefined()
  })

  test("other revoke failures still fail, with a sanitized message", async () => {
    mocks.revokeToken.mockRejectedValue(
      Object.assign(new Error("server_error Bearer ya29.secret"), {
        response: { status: 500 },
      }),
    )
    const error = await integration
      .disconnect(withTokens({ accessToken: "a" }))
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain("ya29.secret")
  })
})

describe("Google Ads connection.verify", () => {
  const auth = { ...baseAuth, metadata: {} }

  test("is healthy while the Google token resolves", async () => {
    mocks.getClient.mockReturnValue({
      getAccessToken: vi.fn().mockResolvedValue({ token: "t" }),
      getTokenInfo: mocks.getTokenInfo.mockResolvedValue({}),
    })

    await expect(connection.verify({ auth })).resolves.toMatchObject({
      ok: true,
    })
  })

  test("flags a Data Manager connection whose grant lacks the datamanager scope", async () => {
    const result = await connection.verify({
      auth: {
        ...baseAuth,
        metadata: {
          scope: "https://www.googleapis.com/auth/adwords openid email",
        },
      },
    })

    expect(result).toMatchObject({ ok: false, revoked: true })
  })

  test("a legacy connection with an adwords-only grant is healthy", async () => {
    mocks.getClient.mockReturnValue({
      getAccessToken: vi.fn().mockResolvedValue({ token: "t" }),
      getTokenInfo: mocks.getTokenInfo.mockResolvedValue({}),
    })

    await expect(
      connection.verify({
        auth: {
          ...baseAuth,
          metadata: {
            uploadMethod: "legacy",
            scope: "https://www.googleapis.com/auth/adwords openid email",
          },
        },
      }),
    ).resolves.toMatchObject({ ok: true })
  })

  test("reports a revoked grant", async () => {
    mocks.getClient.mockReturnValue({
      getAccessToken: vi.fn().mockRejectedValue(
        Object.assign(new Error("invalid_grant"), {
          response: { status: 400 },
        }),
      ),
    })

    await expect(connection.verify({ auth })).resolves.toMatchObject({
      ok: false,
      revoked: true,
    })
  })
})
