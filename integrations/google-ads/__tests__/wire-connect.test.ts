import {
  AuthException,
  ConnectionProviderRejectedError,
  type Oauth2AuthValue,
} from "@chatbotx.io/sdk"
import { describe, expect, test, vi } from "vitest"
import { GoogleAdsException } from "../src/exception"
import type { GoogleAdsAuthValue } from "../src/schemas"

import {
  baseAuth,
  batch,
  CLIENT_A,
  CLIENT_B,
  customerRow,
  DIRECT,
  googleAdsFailure,
  LIST_ACCESSIBLE,
  MANAGER,
  REVOKE_FAILED,
  requests,
  route,
  STREAM,
  useWireServer,
} from "./helpers/wire-server"

vi.mock("../src/constants", async (importOriginal) =>
  (await import("./helpers/wire-server")).mockConstants(
    await importOriginal<typeof import("../src/constants")>(),
  ),
)

vi.mock("../src/client", async (importOriginal) =>
  (await import("./helpers/wire-server")).mockClient(
    await importOriginal<typeof import("../src/client")>(),
  ),
)

useWireServer()

describe("connection.listCandidates end to end", () => {
  const setupAccounts = () => {
    route(LIST_ACCESSIBLE, {
      json: {
        resourceNames: [
          `customers/${MANAGER}`,
          `customers/${DIRECT}`,
          `customers/${CLIENT_A}`,
        ],
      },
    })
    route(STREAM(MANAGER), (req) =>
      (req.json as { query: string }).query.includes("FROM customer_client")
        ? {
            json: [
              batch([
                {
                  customerClient: {
                    clientCustomer: `customers/${DIRECT}`,
                    id: DIRECT,
                    descriptiveName: "Direct via manager",
                    currencyCode: "EUR",
                    status: "ENABLED",
                  },
                },
                {
                  customerClient: {
                    clientCustomer: `customers/${CLIENT_B}`,
                    id: CLIENT_B,
                    descriptiveName: "Only under manager",
                    currencyCode: "GBP",
                    status: "ENABLED",
                  },
                },
              ]),
            ],
          }
        : { json: [batch([customerRow(MANAGER, { manager: true })])] },
    )
    route(STREAM(DIRECT), {
      json: [batch([customerRow(DIRECT, { descriptiveName: "Direct" })])],
    })
    route(STREAM(CLIENT_A), {
      json: [batch([customerRow(CLIENT_A, { status: "CANCELED" })])],
    })
  }

  test("expands managers, prefers direct access, drops disabled accounts and strips the developer token", async () => {
    setupAccounts()
    const { integration } = await import("../src/integration")

    const candidates = await integration.connection?.listCandidates?.({
      auth: baseAuth(),
    } as never)

    expect(candidates?.map((c) => c.sourceId).sort()).toEqual(
      [DIRECT, CLIENT_B].sort(),
    )
    const direct = candidates?.find((c) => c.sourceId === DIRECT)
    expect(direct?.auth.metadata).toMatchObject({
      customerId: DIRECT,
      loginCustomerId: null,
      descriptiveName: "Direct",
      currencyCode: "USD",
    })
    const viaManager = candidates?.find((c) => c.sourceId === CLIENT_B)
    expect(viaManager?.auth.metadata).toMatchObject({
      customerId: CLIENT_B,
      loginCustomerId: MANAGER,
    })
    for (const candidate of candidates ?? []) {
      expect(candidate.auth.metadata).not.toHaveProperty("developerToken")
      expect(JSON.stringify(candidate)).not.toContain("dev-token-abc")
    }
    // Every Ads call carried the developer token.
    for (const req of requests) {
      expect(req.headers["developer-token"]).toBe("dev-token-abc")
    }
  })

  test("a manager whose clients cannot be listed does not hide the other accounts", async () => {
    setupAccounts()
    route(STREAM(MANAGER), (req) =>
      (req.json as { query: string }).query.includes("FROM customer_client")
        ? {
            status: 403,
            json: googleAdsFailure(
              403,
              "PERMISSION_DENIED",
              { authorizationError: "USER_PERMISSION_DENIED" },
              "denied",
            ),
          }
        : { json: [batch([customerRow(MANAGER, { manager: true })])] },
    )
    const { integration } = await import("../src/integration")

    const candidates = await integration.connection?.listCandidates?.({
      auth: baseAuth(),
    } as never)

    expect(candidates?.map((c) => c.sourceId)).toEqual([DIRECT])
  })

  describe.each([
    [503, "UNAVAILABLE", "UNAVAILABLE"],
    [429, "RESOURCE_EXHAUSTED", "RESOURCE_EXHAUSTED"],
  ])("manager expansion failing with %i", (code, status) => {
    const onlyManager = () => {
      route(LIST_ACCESSIBLE, {
        json: { resourceNames: [`customers/${MANAGER}`] },
      })
      route(STREAM(MANAGER), (req) =>
        (req.json as { query: string }).query.includes("FROM customer_client")
          ? {
              status: code,
              json: { error: { code, status, message: "try later" } },
            }
          : { json: [batch([customerRow(MANAGER, { manager: true })])] },
      )
    }

    test("is a retryable provider failure, not an empty 'no accounts' list", async () => {
      onlyManager()
      const { integration } = await import("../src/integration")

      const error = await integration.connection
        ?.listCandidates?.({ auth: baseAuth() } as never)
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(GoogleAdsException)
      expect(error).toMatchObject({ retryable: true, httpStatusCode: code })
    })

    test("with other candidates the partial list is kept", async () => {
      setupAccounts()
      route(STREAM(MANAGER), (req) =>
        (req.json as { query: string }).query.includes("FROM customer_client")
          ? {
              status: code,
              json: { error: { code, status, message: "try later" } },
            }
          : { json: [batch([customerRow(MANAGER, { manager: true })])] },
      )
      const { integration } = await import("../src/integration")

      const candidates = await integration.connection?.listCandidates?.({
        auth: baseAuth(),
      } as never)

      expect(candidates?.map((c) => c.sourceId)).toEqual([DIRECT])
    })
  })

  test("a permanent expansion failure (403) with no other account stays an empty list", async () => {
    route(LIST_ACCESSIBLE, {
      json: { resourceNames: [`customers/${MANAGER}`] },
    })
    route(STREAM(MANAGER), (req) =>
      (req.json as { query: string }).query.includes("FROM customer_client")
        ? {
            status: 403,
            json: googleAdsFailure(
              403,
              "PERMISSION_DENIED",
              { authorizationError: "USER_PERMISSION_DENIED" },
              "denied",
            ),
          }
        : { json: [batch([customerRow(MANAGER, { manager: true })])] },
    )
    const { integration } = await import("../src/integration")

    const candidates = await integration.connection?.listCandidates?.({
      auth: baseAuth(),
    } as never)

    expect(candidates).toEqual([])
  })

  test("a Google user without any Ads account (401 NOT_ADS_USER) yields no candidates", async () => {
    route(LIST_ACCESSIBLE, {
      status: 401,
      json: googleAdsFailure(
        401,
        "UNAUTHENTICATED",
        { authenticationError: "NOT_ADS_USER" },
        "User in the cookie is not a valid Ads user.",
      ),
    })
    const { integration } = await import("../src/integration")

    const candidates = await integration.connection?.listCandidates?.({
      auth: baseAuth(),
    } as never)

    expect(candidates).toEqual([])
  })

  test("customers failing with a streamed [{error}] CUSTOMER_NOT_ENABLED body are skipped, not blamed on the token", async () => {
    const ownerBody = [
      {
        error: {
          code: 403,
          message: "The caller does not have permission",
          status: "PERMISSION_DENIED",
          details: [
            {
              "@type":
                "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure",
              errors: [
                {
                  errorCode: { authorizationError: "CUSTOMER_NOT_ENABLED" },
                  message:
                    "The customer account can't be accessed because it is not yet enabled or has been deactivated.",
                },
              ],
            },
          ],
        },
      },
    ]
    route(LIST_ACCESSIBLE, {
      json: { resourceNames: [`customers/${DIRECT}`, `customers/${CLIENT_A}`] },
    })
    route(STREAM(DIRECT), { status: 403, json: ownerBody })
    route(STREAM(CLIENT_A), { status: 403, json: ownerBody })
    const { integration } = await import("../src/integration")

    const candidates = await integration.connection?.listCandidates?.({
      auth: baseAuth(),
    } as never)

    expect(candidates).toEqual([])
  })

  describe("a Google Cloud project not approved for production", () => {
    const notApprovedBody = [
      {
        error: {
          code: 403,
          message: "The caller does not have permission",
          status: "PERMISSION_DENIED",
          details: [
            {
              "@type":
                "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure",
              errors: [
                {
                  errorCode: {
                    authorizationError:
                      "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
                  },
                  message:
                    "The Google Cloud project 123456 is not approved for production.",
                },
              ],
            },
          ],
        },
      },
    ]
    const inactiveBody = [
      {
        error: {
          code: 403,
          message: "The caller does not have permission",
          status: "PERMISSION_DENIED",
          details: [
            {
              errors: [
                {
                  errorCode: { authorizationError: "CUSTOMER_NOT_ENABLED" },
                  message: "not enabled",
                },
              ],
            },
          ],
        },
      },
    ]

    test("two inactive customers plus one not-approved is a classified project_not_approved rejection", async () => {
      route(LIST_ACCESSIBLE, {
        json: {
          resourceNames: [
            `customers/${DIRECT}`,
            `customers/${CLIENT_A}`,
            `customers/${CLIENT_B}`,
          ],
        },
      })
      route(STREAM(DIRECT), { status: 403, json: inactiveBody })
      route(STREAM(CLIENT_A), { status: 403, json: inactiveBody })
      route(STREAM(CLIENT_B), { status: 403, json: notApprovedBody })
      const { integration } = await import("../src/integration")

      const error = await integration.connection
        ?.listCandidates?.({ auth: baseAuth() } as never)
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ConnectionProviderRejectedError)
      expect(error).toMatchObject({ failureCause: "project_not_approved" })
      expect(JSON.stringify((error as Error).message)).not.toContain("123456")
    })

    test("with one readable account the good account is kept", async () => {
      route(LIST_ACCESSIBLE, {
        json: {
          resourceNames: [`customers/${DIRECT}`, `customers/${CLIENT_B}`],
        },
      })
      route(STREAM(DIRECT), {
        json: [batch([customerRow(DIRECT, { descriptiveName: "Direct" })])],
      })
      route(STREAM(CLIENT_B), { status: 403, json: notApprovedBody })
      const { integration } = await import("../src/integration")

      const candidates = await integration.connection?.listCandidates?.({
        auth: baseAuth(),
      } as never)

      expect(candidates?.map((c) => c.sourceId)).toEqual([DIRECT])
    })
  })

  test("an unapproved developer token surfaces as a classified provider rejection", async () => {
    route(LIST_ACCESSIBLE, {
      status: 403,
      json: googleAdsFailure(
        403,
        "PERMISSION_DENIED",
        { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" },
        "The developer token is only approved for use with test accounts.",
      ),
    })
    const { integration } = await import("../src/integration")

    const error = await integration.connection
      ?.listCandidates?.({ auth: baseAuth() } as never)
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConnectionProviderRejectedError)
  })
})

const ALL_SCOPES =
  "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/datamanager openid email"

describe("Google OAuth endpoints (real google-auth-library)", () => {
  test("exchangeCode posts the code to the token endpoint and reads tokeninfo for the identity", async () => {
    route("POST /oauth/token", () => ({
      json: {
        access_token: "ya29.new",
        refresh_token: "1//new-refresh",
        expires_in: 3599,
        scope: ALL_SCOPES,
        token_type: "Bearer",
        id_token: "x.y.z",
      },
    }))
    route("POST /oauth/tokeninfo", {
      json: {
        azp: "client-1",
        aud: "client-1",
        sub: "110000000000000000001",
        scope: ALL_SCOPES,
        exp: "1900000000",
        expires_in: "3599",
        email: "owner@example.test",
        email_verified: "true",
        access_type: "offline",
      },
    })
    route("GET /oauth/tokeninfo", {
      json: { sub: "110000000000000000001", email: "owner@example.test" },
    })
    const { integration } = await import("../src/integration")

    const auth = (await integration.connection?.exchangeCode?.({
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential: {
        authType: "oauth2",
        clientId: "client-1",
        clientSecret: "secret-1",
        redirectUrl: "https://app.example.test/callback",
        developerToken: "dev-token-abc",
      },
    } as never)) as GoogleAdsAuthValue

    expect(auth.tokens.accessToken).toBe("ya29.new")
    expect(auth.tokens.refreshToken).toBe("1//new-refresh")
    expect(auth.metadata).toMatchObject({
      accountId: "110000000000000000001",
      email: "owner@example.test",
      developerToken: "dev-token-abc",
    })
    const tokenCall = requests.find((r) => r.path === "/oauth/token")
    expect(tokenCall?.raw).toContain("code=auth-code")
    expect(tokenCall?.raw).toContain("grant_type=authorization_code")
  })

  test("refreshAuth exchanges the refresh token and keeps it when Google omits it", async () => {
    route("POST /oauth/token", {
      json: {
        access_token: "ya29.fresh",
        expires_in: 3599,
        token_type: "Bearer",
      },
    })
    const { integration } = await import("../src/integration")

    const refreshed = (await integration.refreshAuth?.({
      auth: baseAuth() as Oauth2AuthValue,
    } as never)) as GoogleAdsAuthValue

    expect(refreshed.tokens.accessToken).toBe("ya29.fresh")
    expect(refreshed.tokens.refreshToken).toBe("1//refresh")
    expect(requests[0]?.raw).toContain("grant_type=refresh_token")
  })

  test("refreshAuth maps invalid_grant to AuthException", async () => {
    route("POST /oauth/token", {
      status: 400,
      json: {
        error: "invalid_grant",
        error_description: "Token has been expired or revoked.",
      },
    })
    const { integration } = await import("../src/integration")

    await expect(
      integration.refreshAuth?.({
        auth: baseAuth() as Oauth2AuthValue,
      } as never),
    ).rejects.toBeInstanceOf(AuthException)
  })

  test("disconnect revokes the refresh token and tolerates an already-invalid token", async () => {
    const { integration } = await import("../src/integration")

    route("POST /oauth/revoke", { json: {} })
    await integration.disconnect?.(baseAuth() as never)
    expect(requests[0]?.raw + requests[0]?.query.toString()).toContain(
      "1%2F%2Frefresh",
    )

    route("POST /oauth/revoke", {
      status: 400,
      json: {
        error: "invalid_token",
        error_description: "Token expired or revoked",
      },
    })
    await expect(
      integration.disconnect?.(baseAuth() as never),
    ).resolves.toBeUndefined()

    route("POST /oauth/revoke", {
      status: 500,
      json: { error: "backend_error" },
    })
    await expect(integration.disconnect?.(baseAuth() as never)).rejects.toThrow(
      REVOKE_FAILED,
    )
  })

  test("verify reports a revoked credential when tokeninfo answers 400 invalid_token", async () => {
    route("POST /oauth/tokeninfo", {
      status: 400,
      json: { error: "invalid_token", error_description: "Invalid Value" },
    })
    route("GET /oauth/tokeninfo", {
      status: 400,
      json: { error: "invalid_token", error_description: "Invalid Value" },
    })
    const { integration } = await import("../src/integration")

    const health = await integration.connection?.verify?.({
      auth: {
        ...baseAuth(),
        tokens: {
          accessToken: "ya29.access",
          refreshToken: "1//r",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      },
    } as never)

    expect(health?.ok).toBe(false)
  })
})

describe("partial OAuth consent (granted scopes)", () => {
  // https://developers.google.com/identity/protocols/oauth2/web-server (granular
  // permissions): the token response `scope` lists what the user actually granted.
  const exchange = async (scope: string | undefined) => {
    route("POST /oauth/token", () => ({
      json: {
        access_token: "ya29.new",
        refresh_token: "1//new-refresh",
        expires_in: 3599,
        token_type: "Bearer",
        ...(scope === undefined ? {} : { scope }),
      },
    }))
    route("POST /oauth/tokeninfo", {
      json: { sub: "110000000000000000001", email: "o@example.test", scope },
    })
    route("GET /oauth/tokeninfo", {
      json: { sub: "110000000000000000001", email: "o@example.test", scope },
    })
    const { integration } = await import("../src/integration")
    return await integration.connection
      ?.exchangeCode?.({
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {
          authType: "oauth2",
          clientId: "client-1",
          clientSecret: "secret-1",
          redirectUrl: "https://app.example.test/callback",
          developerToken: "dev-token-abc",
        },
      } as never)
      .catch((e: unknown) => e)
  }

  test("a token without the Data Manager scope is rejected as scope_missing", async () => {
    const result = await exchange(
      "https://www.googleapis.com/auth/adwords openid email",
    )

    expect(result).toBeInstanceOf(ConnectionProviderRejectedError)
    expect(result).toMatchObject({ failureCause: "scope_missing" })
  })

  test("a token without the Google Ads scope is rejected as scope_missing", async () => {
    const result = await exchange(
      "https://www.googleapis.com/auth/datamanager openid email",
    )

    expect(result).toMatchObject({ failureCause: "scope_missing" })
  })

  test("both scopes granted (any order) connect", async () => {
    const result = await exchange(
      "openid https://www.googleapis.com/auth/datamanager email https://www.googleapis.com/auth/adwords",
    )

    expect(result).not.toBeInstanceOf(Error)
  })

  test("falls back to the tokeninfo scopes when the token response has none", async () => {
    route("POST /oauth/token", {
      json: {
        access_token: "ya29.new",
        refresh_token: "1//new-refresh",
        expires_in: 3599,
        token_type: "Bearer",
      },
    })
    const tokenInfo = {
      sub: "1",
      email: "o@example.test",
      scope: "https://www.googleapis.com/auth/adwords",
    }
    route("POST /oauth/tokeninfo", { json: tokenInfo })
    route("GET /oauth/tokeninfo", { json: tokenInfo })
    const { integration } = await import("../src/integration")

    const result = await integration.connection
      ?.exchangeCode?.({
        code: "c",
        callbackUrl: "https://app.example.test/callback",
        credential: {
          authType: "oauth2",
          clientId: "client-1",
          clientSecret: "secret-1",
          redirectUrl: "https://app.example.test/callback",
          developerToken: "dev-token-abc",
        },
      } as never)
      .catch((e: unknown) => e)

    expect(result).toMatchObject({ failureCause: "scope_missing" })
  })

  test("verify flags a stored connection whose scopes lack Data Manager", async () => {
    const info = {
      sub: "1",
      aud: "client-1",
      scope: ALL_SCOPES,
      expires_in: "3599",
      access_type: "offline",
    }
    route("POST /oauth/tokeninfo", { json: info })
    route("GET /oauth/tokeninfo", { json: info })
    const { integration } = await import("../src/integration")
    const auth = (scope?: string) => ({
      ...baseAuth(),
      tokens: {
        accessToken: "ya29.access",
        refreshToken: "1//r",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      metadata: { accountId: "g-1", scope },
    })

    const missing = await integration.connection?.verify?.({
      auth: auth("https://www.googleapis.com/auth/adwords openid"),
    } as never)
    const complete = await integration.connection?.verify?.({
      auth: auth(ALL_SCOPES),
    } as never)
    const legacy = await integration.connection?.verify?.({
      auth: auth(undefined),
    } as never)

    expect(missing).toMatchObject({ ok: false, revoked: true })
    expect(complete?.ok).toBe(true)
    // Rows saved before the scope was recorded must not be mass-flagged.
    expect(legacy?.ok).toBe(true)
  })
})
