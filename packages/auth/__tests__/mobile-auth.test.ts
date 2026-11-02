import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"
import { verifyJwsAccessToken } from "better-auth/oauth2"
import { jwt } from "better-auth/plugins"
import { beforeEach, describe, expect, test, vi } from "vitest"

const ISSUER = "https://app.example.com"
const AUDIENCE = "https://app.example.com/api"
const PASSWORD = "correct-horse-battery"

type VerificationRow = {
  identifier: string
  value: string
  expiresAt: Date
}
type RefreshRecord = { userId: string; deviceId: string; spent: boolean }

const { verificationRows, refreshTokens, refreshService, userService } =
  vi.hoisted(() => {
    const verificationRows: VerificationRow[] = []
    const refreshTokens = new Map<string, RefreshRecord>()
    let counter = 0
    const issue = (props: { userId: string; deviceId: string }) => {
      const token = `rt-${++counter}`
      refreshTokens.set(token, {
        userId: props.userId,
        deviceId: props.deviceId,
        spent: false,
      })
      return Promise.resolve({
        token,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
    }
    return {
      verificationRows,
      refreshTokens,
      refreshService: {
        issue: vi.fn(issue),
        rotate: vi.fn(async ({ token }: { token: string }) => {
          const record = refreshTokens.get(token)
          if (!record) {
            return { kind: "invalid" as const }
          }
          if (record.spent) {
            return {
              kind: "reused" as const,
              userId: record.userId,
              deviceId: record.deviceId,
            }
          }
          record.spent = true
          return {
            kind: "rotated" as const,
            userId: record.userId,
            deviceId: record.deviceId,
            refreshToken: await issue(record),
          }
        }),
        revokeByToken: vi.fn(async () => undefined),
        revokeAllForUser: vi.fn(async () => undefined),
      },
      userService: { clearMustChangePassword: vi.fn(async () => undefined) },
    }
  })

vi.mock("@chatbotx.io/business", () => ({
  mobileRefreshTokenService: refreshService,
  userService,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  eq: (_column: unknown, value: string) => value,
  db: {
    insert: () => ({
      values: (row: VerificationRow) => {
        verificationRows.push(row)
        return Promise.resolve()
      },
    }),
    delete: () => ({
      where: (identifier: string) => ({
        returning: () => {
          const index = verificationRows.findIndex(
            (row) => row.identifier === identifier,
          )
          return Promise.resolve(
            index === -1 ? [] : verificationRows.splice(index, 1),
          )
        },
      }),
    }),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  verificationModel: { identifier: "identifier" },
}))

vi.mock("../src/keys", () => ({
  getBuilderOrigin: () => ISSUER,
  getMobileApiAudience: () => AUDIENCE,
  getMobileAppSchemes: () => ["chatbotxmobileapp"],
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

const { mobileAuth } = await import("../src/mobile-auth")

const tables = () => ({
  user: [] as Record<string, unknown>[],
  session: [] as Record<string, unknown>[],
  account: [] as Record<string, unknown>[],
  verification: [] as Record<string, unknown>[],
  jwks: [] as Record<string, unknown>[],
})

const createTestAuth = (store: ReturnType<typeof tables>) =>
  betterAuth({
    baseURL: ISSUER,
    secret: "a-very-long-test-secret-for-better-auth-0123456789",
    database: memoryAdapter(store),
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    user: {
      additionalFields: {
        mustChangePassword: {
          type: "boolean",
          required: false,
          input: false,
          returned: true,
        },
      },
    },
    plugins: [
      jwt({ disableSettingJwtHeader: true, jwt: { issuer: ISSUER } }),
      mobileAuth(),
    ],
  })

type TestAuth = ReturnType<typeof createTestAuth>

const seedUser = async (
  auth: TestAuth,
  overrides: { emailVerified?: boolean; mustChangePassword?: boolean } = {},
) => {
  const ctx = await auth.$context
  const user = await ctx.internalAdapter.createUser({
    email: "agent@example.com",
    name: "Agent",
    emailVerified: overrides.emailVerified ?? true,
    mustChangePassword: overrides.mustChangePassword ?? false,
  })
  await ctx.internalAdapter.createAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(PASSWORD),
  })
  return user
}

const post = (auth: TestAuth, path: string, body: unknown) =>
  auth.handler(
    new Request(`${ISSUER}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )

const tokenGrant = (auth: TestAuth, body: Record<string, unknown>) =>
  post(auth, "/mobile/token", body)

// Signature, issuer, audience and expiry verified against the published JWKS —
// the same check `verifyMobileAccessToken` makes in production.
const verifyAccessToken = async (
  auth: TestAuth,
  token: string,
  audience = AUDIENCE,
) => {
  const payload = await verifyJwsAccessToken(token, {
    jwksFetch: async () => await auth.api.getJwks(),
    verifyOptions: { issuer: ISSUER, audience },
  })
  return { payload }
}

const sessionCookie = async (auth: TestAuth) => {
  const response = await auth.handler(
    new Request(`${ISSUER}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "agent@example.com", password: PASSWORD }),
    }),
  )
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ")
}

let store: ReturnType<typeof tables>
let auth: TestAuth

beforeEach(() => {
  vi.clearAllMocks()
  verificationRows.length = 0
  refreshTokens.clear()
  store = tables()
  auth = createTestAuth(store)
})

describe("POST /mobile/token — password grant", () => {
  test("returns a short-lived access JWT for the mobile audience plus a refresh token, without creating a session", async () => {
    const user = await seedUser(auth)

    const response = await tokenGrant(auth, {
      grantType: "password",
      email: "Agent@Example.com",
      password: PASSWORD,
      deviceId: "install-1",
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const body = await response.json()
    expect(body).toMatchObject({
      tokenType: "Bearer",
      expiresIn: 600,
      deviceId: "install-1",
      mustChangePassword: false,
      refreshToken: "rt-1",
    })
    const { payload } = await verifyAccessToken(auth, body.accessToken)
    expect(payload).toMatchObject({
      sub: user.id,
      iss: ISSUER,
      aud: AUDIENCE,
      deviceId: "install-1",
      mustChangePassword: false,
    })
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(600)
    expect(body.expiresAt).toBe((payload.exp ?? 0) * 1000)
    expect(store.session).toHaveLength(0)
    expect(refreshService.issue).toHaveBeenCalledWith({
      userId: user.id,
      deviceId: "install-1",
    })
  })

  test("carries mustChangePassword in the claim and the response", async () => {
    await seedUser(auth, { mustChangePassword: true })

    const body = await (
      await tokenGrant(auth, {
        grantType: "password",
        email: "agent@example.com",
        password: PASSWORD,
      })
    ).json()

    expect(body.mustChangePassword).toBe(true)
    const { payload } = await verifyAccessToken(auth, body.accessToken)
    expect(payload.mustChangePassword).toBe(true)
  })

  test("the access token is not valid for the MCP audience", async () => {
    await seedUser(auth)
    const body = await (
      await tokenGrant(auth, {
        grantType: "password",
        email: "agent@example.com",
        password: PASSWORD,
      })
    ).json()

    await expect(
      verifyAccessToken(auth, body.accessToken, "https://app.example.com/mcp"),
    ).rejects.toThrow()
  })

  test.each([
    ["a wrong password", "agent@example.com", "wrong-password-1"],
    ["an unknown email", "nobody@example.com", PASSWORD],
  ])("%s is 401 INVALID_EMAIL_OR_PASSWORD and issues nothing", async (_name, email, password) => {
    await seedUser(auth)

    const response = await tokenGrant(auth, {
      grantType: "password",
      email,
      password,
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      code: "INVALID_EMAIL_OR_PASSWORD",
    })
    expect(refreshService.issue).not.toHaveBeenCalled()
    expect(store.session).toHaveLength(0)
  })

  test("an unverified email is 403 EMAIL_NOT_VERIFIED, like sign-in", async () => {
    await seedUser(auth, { emailVerified: false })

    const response = await tokenGrant(auth, {
      grantType: "password",
      email: "agent@example.com",
      password: PASSWORD,
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" })
    expect(refreshService.issue).not.toHaveBeenCalled()
  })

  test("rejects an unknown grant type and a malformed device id", async () => {
    await seedUser(auth)

    const unknownGrant = await tokenGrant(auth, {
      grantType: "client_credentials",
    })
    const badDevice = await tokenGrant(auth, {
      grantType: "password",
      email: "agent@example.com",
      password: PASSWORD,
      deviceId: "has spaces!",
    })

    expect(unknownGrant.status).toBe(400)
    expect(badDevice.status).toBe(400)
  })

  test("is throttled like sign-in: 3 attempts per 10 seconds per IP", () => {
    const plugin = mobileAuth()

    const [rule] = plugin.rateLimit
    expect(rule.pathMatcher("/mobile/token")).toBe(true)
    expect(rule.pathMatcher("/mobile/revoke")).toBe(false)
    expect({ window: rule.window, max: rule.max }).toEqual({
      window: 10,
      max: 3,
    })
  })
})

describe("social flow — /mobile/callback and exchange_code", () => {
  const callback = async (query: Record<string, string>, cookie?: string) =>
    await auth.handler(
      new Request(
        `${ISSUER}/api/auth/mobile/callback?${new URLSearchParams(query)}`,
        { headers: cookie ? { cookie } : {} },
      ),
    )

  const codeFrom = (response: Response) =>
    new URL(response.headers.get("location") ?? "").searchParams.get("code")

  test("mints a one-time code, redirects to the app scheme, and drops the browser session", async () => {
    await seedUser(auth)
    const cookie = await sessionCookie(auth)
    expect(store.session).toHaveLength(1)

    const response = await callback(
      {
        redirect_uri: "chatbotxmobileapp://auth-callback",
        device_id: "install-9",
        state: "xyz",
      },
      cookie,
    )

    expect(response.status).toBe(302)
    const location = new URL(response.headers.get("location") ?? "")
    expect(`${location.protocol}//${location.host}`).toBe(
      "chatbotxmobileapp://auth-callback",
    )
    expect(location.searchParams.get("state")).toBe("xyz")
    expect(location.searchParams.get("code")).toBeTruthy()
    expect(store.session).toHaveLength(0)
    // Only a hash of the code is stored, never the code itself.
    expect(JSON.stringify(verificationRows)).not.toContain(
      location.searchParams.get("code") ?? "never",
    )
  })

  test("the code exchanges once for tokens bound to the callback's device id; a second use fails", async () => {
    const user = await seedUser(auth)
    const response = await callback(
      {
        redirect_uri: "chatbotxmobileapp://auth-callback",
        device_id: "install-9",
      },
      await sessionCookie(auth),
    )
    const code = codeFrom(response)

    const first = await tokenGrant(auth, { grantType: "exchange_code", code })
    const second = await tokenGrant(auth, { grantType: "exchange_code", code })

    expect(first.status).toBe(200)
    const body = await first.json()
    expect(body.deviceId).toBe("install-9")
    const { payload } = await verifyAccessToken(auth, body.accessToken)
    expect(payload.sub).toBe(user.id)
    expect(second.status).toBe(401)
    expect(await second.json()).toMatchObject({ code: "INVALID_EXCHANGE_CODE" })
  })

  test("an expired code is rejected", async () => {
    await seedUser(auth)
    const code = codeFrom(
      await callback(
        { redirect_uri: "chatbotxmobileapp://auth-callback" },
        await sessionCookie(auth),
      ),
    )
    verificationRows[0].expiresAt = new Date(Date.now() - 1)

    const response = await tokenGrant(auth, {
      grantType: "exchange_code",
      code,
    })

    expect(response.status).toBe(401)
  })

  test("a code minted with a PKCE challenge needs the matching verifier, and a wrong one burns the code", async () => {
    await seedUser(auth)
    const verifier = "a".repeat(64)
    const challenge = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ).toString("base64url")
    const mint = async () =>
      codeFrom(
        await callback(
          {
            redirect_uri: "chatbotxmobileapp://auth-callback",
            code_challenge: challenge,
          },
          await sessionCookie(auth),
        ),
      )

    const stolen = await mint()
    const withoutVerifier = await tokenGrant(auth, {
      grantType: "exchange_code",
      code: stolen,
    })
    const retryAfterFailure = await tokenGrant(auth, {
      grantType: "exchange_code",
      code: stolen,
      codeVerifier: verifier,
    })
    const legitimate = await mint()
    const wrongVerifier = await tokenGrant(auth, {
      grantType: "exchange_code",
      code: legitimate,
      codeVerifier: "b".repeat(64),
    })
    const fresh = await mint()
    const ok = await tokenGrant(auth, {
      grantType: "exchange_code",
      code: fresh,
      codeVerifier: verifier,
    })

    expect(withoutVerifier.status).toBe(401)
    expect(retryAfterFailure.status).toBe(401)
    expect(wrongVerifier.status).toBe(401)
    expect(ok.status).toBe(200)
  })

  test.each([
    ["an https redirect", "https://evil.example.com/steal"],
    ["an unregistered app scheme", "otherapp://auth-callback"],
    ["a javascript URL", "javascript:alert(1)"],
  ])("refuses %s as redirect_uri without redirecting", async (_name, redirectUri) => {
    await seedUser(auth)

    const response = await callback(
      { redirect_uri: redirectUri },
      await sessionCookie(auth),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get("location")).toBeNull()
    expect(verificationRows).toHaveLength(0)
  })

  test("without a session it redirects back with error=access_denied and mints no code", async () => {
    const response = await callback({
      redirect_uri: "chatbotxmobileapp://auth-callback",
      state: "s1",
    })

    const location = new URL(response.headers.get("location") ?? "")
    expect(location.searchParams.get("error")).toBe("access_denied")
    expect(location.searchParams.get("state")).toBe("s1")
    expect(location.searchParams.get("code")).toBeNull()
    expect(verificationRows).toHaveLength(0)
  })
})

describe("refresh_token grant and revoke", () => {
  test("rotates: returns a new access token and a new refresh token for the same device", async () => {
    const user = await seedUser(auth)
    const login = await (
      await tokenGrant(auth, {
        grantType: "password",
        email: "agent@example.com",
        password: PASSWORD,
        deviceId: "install-1",
      })
    ).json()

    const response = await tokenGrant(auth, {
      grantType: "refresh_token",
      refreshToken: login.refreshToken,
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.refreshToken).not.toBe(login.refreshToken)
    expect(body.deviceId).toBe("install-1")
    const { payload } = await verifyAccessToken(auth, body.accessToken)
    expect(payload.sub).toBe(user.id)
  })

  test("reusing a spent refresh token is 401 REFRESH_TOKEN_REUSED", async () => {
    await seedUser(auth)
    const login = await (
      await tokenGrant(auth, {
        grantType: "password",
        email: "agent@example.com",
        password: PASSWORD,
      })
    ).json()
    await tokenGrant(auth, {
      grantType: "refresh_token",
      refreshToken: login.refreshToken,
    })

    const replay = await tokenGrant(auth, {
      grantType: "refresh_token",
      refreshToken: login.refreshToken,
    })

    expect(replay.status).toBe(401)
    expect(await replay.json()).toMatchObject({ code: "REFRESH_TOKEN_REUSED" })
  })

  test("an unknown refresh token is 401 INVALID_REFRESH_TOKEN", async () => {
    const response = await tokenGrant(auth, {
      grantType: "refresh_token",
      refreshToken: "nope",
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    })
  })

  test("POST /mobile/revoke revokes the token's family and always answers success", async () => {
    const response = await post(auth, "/mobile/revoke", {
      refreshToken: "whatever",
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(refreshService.revokeByToken).toHaveBeenCalledWith({
      token: "whatever",
    })
  })
})

describe("password change", () => {
  test("mobileChangePassword is not reachable over HTTP", async () => {
    const response = await post(auth, "/mobile/change-password", {
      userId: "1",
      currentPassword: PASSWORD,
      newPassword: "another-long-password",
      deviceId: "install-1",
    })

    expect(response.status).toBe(404)
  })

  test("verifies the current password, ends every login, clears the flag, and returns a fresh token pair", async () => {
    const user = await seedUser(auth, { mustChangePassword: true })
    await sessionCookie(auth)
    expect(store.session).toHaveLength(1)

    const result = await auth.api.mobileChangePassword({
      body: {
        userId: user.id,
        currentPassword: PASSWORD,
        newPassword: "another-long-password",
        deviceId: "install-1",
      },
    })

    expect(result).toMatchObject({
      tokenType: "Bearer",
      deviceId: "install-1",
      mustChangePassword: false,
    })
    expect(refreshService.revokeAllForUser).toHaveBeenCalledWith({
      userId: user.id,
    })
    expect(userService.clearMustChangePassword).toHaveBeenCalledWith(user.id)
    expect(store.session).toHaveLength(0)
    // The old password no longer works; the new one does.
    const oldLogin = await tokenGrant(auth, {
      grantType: "password",
      email: "agent@example.com",
      password: PASSWORD,
    })
    const newLogin = await tokenGrant(auth, {
      grantType: "password",
      email: "agent@example.com",
      password: "another-long-password",
    })
    expect(oldLogin.status).toBe(401)
    expect(newLogin.status).toBe(200)
  })

  test.each([
    ["a wrong current password", "not-the-password", "another-long-password"],
    ["an unchanged password", PASSWORD, PASSWORD],
    ["a too-short new password", PASSWORD, "short"],
  ])("%s is rejected and nothing is revoked", async (_name, current, next) => {
    const user = await seedUser(auth)

    await expect(
      auth.api.mobileChangePassword({
        body: {
          userId: user.id,
          currentPassword: current,
          newPassword: next,
          deviceId: "install-1",
        },
      }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" })
    expect(refreshService.revokeAllForUser).not.toHaveBeenCalled()
  })

  test("a web-side change-password also revokes every mobile login", async () => {
    const user = await seedUser(auth)
    const cookie = await sessionCookie(auth)

    const response = await auth.handler(
      new Request(`${ISSUER}/api/auth/change-password`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          currentPassword: PASSWORD,
          newPassword: "web-side-new-password",
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(refreshService.revokeAllForUser).toHaveBeenCalledWith({
      userId: user.id,
    })
  })

  test("a failed web-side change-password revokes nothing", async () => {
    await seedUser(auth)
    const cookie = await sessionCookie(auth)

    const response = await auth.handler(
      new Request(`${ISSUER}/api/auth/change-password`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          currentPassword: "wrong-current-password",
          newPassword: "web-side-new-password",
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(refreshService.revokeAllForUser).not.toHaveBeenCalled()
  })
})
