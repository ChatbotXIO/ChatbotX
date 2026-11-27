import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"
import { verifyJwsAccessToken } from "better-auth/oauth2"
import { jwt } from "better-auth/plugins"
import { beforeEach, describe, expect, test, vi } from "vitest"

const ISSUER = "https://app.example.com"
const AUDIENCE = "https://app.example.com/api"
const PASSWORD = "correct-horse-battery"
const PKCE_VERIFIER = "a".repeat(64)

type RefreshRecord = { userId: string; deviceId: string; spent: boolean }

const { refreshTokens, refreshService, userService } = vi.hoisted(() => {
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
    userService: {
      clearMustChangePassword: vi.fn(async () => undefined),
      findById: vi.fn(async (id: string) => ({
        deletionRequestedAt: null,
        id,
      })),
    },
  }
})

vi.mock("@chatbotx.io/business", () => ({
  mobileRefreshTokenService: refreshService,
  userService,
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
  post(
    auth,
    "/mobile/token",
    body.grantType === "exchange_code" && !body.codeVerifier
      ? { ...body, codeVerifier: PKCE_VERIFIER }
      : body,
  )

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
  const callback = async (query: Record<string, string>, cookie?: string) => {
    const codeChallenge =
      query.code_challenge ??
      Buffer.from(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(PKCE_VERIFIER),
        ),
      ).toString("base64url")
    return await auth.handler(
      new Request(
        `${ISSUER}/api/auth/mobile/callback?${new URLSearchParams({
          ...query,
          code_challenge: codeChallenge,
        })}`,
        { headers: cookie ? { cookie } : {} },
      ),
    )
  }

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
    expect(JSON.stringify(store.verification)).not.toContain(
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

  test("atomically consumes a concurrently exchanged code", async () => {
    await seedUser(auth)
    const code = codeFrom(
      await callback(
        { redirect_uri: "chatbotxmobileapp://auth-callback" },
        await sessionCookie(auth),
      ),
    )

    const responses = await Promise.all([
      tokenGrant(auth, { grantType: "exchange_code", code }),
      tokenGrant(auth, { grantType: "exchange_code", code }),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ])
  })

  test("requires PKCE challenge and verifier for custom-scheme exchange", async () => {
    await seedUser(auth)
    const missingChallenge = await auth.handler(
      new Request(
        `${ISSUER}/api/auth/mobile/callback?${new URLSearchParams({
          redirect_uri: "chatbotxmobileapp://auth-callback",
        })}`,
        { headers: { cookie: await sessionCookie(auth) } },
      ),
    )
    expect(missingChallenge.status).toBe(400)
    expect(store.verification).toHaveLength(0)

    const code = codeFrom(
      await callback(
        { redirect_uri: "chatbotxmobileapp://auth-callback" },
        await sessionCookie(auth),
      ),
    )
    const missingVerifier = await post(auth, "/mobile/token", {
      grantType: "exchange_code",
      code,
    })
    expect(missingVerifier.status).toBe(400)
    await expect(
      tokenGrant(auth, { grantType: "exchange_code", code }),
    ).resolves.toMatchObject({ status: 200 })
  })

  test("an expired code is rejected", async () => {
    await seedUser(auth)
    const code = codeFrom(
      await callback(
        { redirect_uri: "chatbotxmobileapp://auth-callback" },
        await sessionCookie(auth),
      ),
    )
    store.verification[0].expiresAt = new Date(Date.now() - 1)

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

    const missingVerifierCode = await mint()
    const withoutVerifier = await post(auth, "/mobile/token", {
      grantType: "exchange_code",
      code: missingVerifierCode,
    })
    const retryAfterMissingVerifier = await tokenGrant(auth, {
      grantType: "exchange_code",
      code: missingVerifierCode,
      codeVerifier: verifier,
    })
    const stolen = await mint()
    const wrongVerifier = await tokenGrant(auth, {
      grantType: "exchange_code",
      code: stolen,
      codeVerifier: "b".repeat(64),
    })
    const retryAfterWrongVerifier = await tokenGrant(auth, {
      grantType: "exchange_code",
      code: stolen,
      codeVerifier: verifier,
    })
    const fresh = await mint()
    const ok = await tokenGrant(auth, {
      grantType: "exchange_code",
      code: fresh,
      codeVerifier: verifier,
    })

    expect(withoutVerifier.status).toBe(400)
    expect(retryAfterMissingVerifier.status).toBe(200)
    expect(wrongVerifier.status).toBe(401)
    expect(retryAfterWrongVerifier.status).toBe(401)
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
    expect(store.verification).toHaveLength(0)
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
    expect(store.verification).toHaveLength(0)
  })
})

describe("web account handoff", () => {
  const followHandoff = async (code: string) =>
    await auth.handler(
      new Request(`${ISSUER}/api/auth/account/handoff?code=${code}`),
    )

  test("creates a web session and redirects to account deletion", async () => {
    const user = await seedUser(auth)
    const { code } = await auth.api.mobileCreateWebHandoff({
      body: { userId: user.id },
    })

    const response = await followHandoff(code)

    expect(response.headers.get("location")).toBe("/account/delete")
    expect(store.session).toHaveLength(1)
  })

  test("redirects reused or expired handoff codes to sign-in", async () => {
    const user = await seedUser(auth)
    const { code } = await auth.api.mobileCreateWebHandoff({
      body: { userId: user.id },
    })
    await followHandoff(code)

    const response = await followHandoff(code)

    expect(response.headers.get("location")).toBe(
      "/auth/sign-in?error=handoff_invalid",
    )
    expect(store.session).toHaveLength(1)
  })

  test("redirects a missing, empty, or invalid handoff code to sign-in", async () => {
    const missing = await auth.handler(
      new Request(`${ISSUER}/api/auth/account/handoff`),
    )
    const empty = await auth.handler(
      new Request(`${ISSUER}/api/auth/account/handoff?code=`),
    )
    const invalid = await followHandoff("not-a-handoff-code")

    for (const response of [missing, empty, invalid]) {
      expect(response.headers.get("location")).toBe(
        "/auth/sign-in?error=handoff_invalid",
      )
    }
    expect(store.session).toHaveLength(0)
  })

  test("redirects an account missing from the primary user store to sign-in", async () => {
    const user = await seedUser(auth)
    const { code } = await auth.api.mobileCreateWebHandoff({
      body: { userId: user.id },
    })
    userService.findById.mockResolvedValueOnce(undefined)

    const response = await followHandoff(code)

    expect(response.headers.get("location")).toBe(
      "/auth/sign-in?error=handoff_invalid",
    )
    expect(store.session).toHaveLength(0)
  })

  test("redirects a pending-deletion user without creating a replacement session", async () => {
    const user = await seedUser(auth)
    const { code } = await auth.api.mobileCreateWebHandoff({
      body: { userId: user.id },
    })
    userService.findById.mockResolvedValueOnce({
      deletionRequestedAt: new Date(),
      id: user.id,
    })

    const response = await followHandoff(code)

    expect(response.headers.get("location")).toBe("/account/delete?requested=1")
    expect(store.session).toHaveLength(0)
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

  test("revokes the refresh-token family for a pending-deletion user", async () => {
    const user = await seedUser(auth)
    const login = await (
      await tokenGrant(auth, {
        grantType: "password",
        email: "agent@example.com",
        password: PASSWORD,
        deviceId: "install-1",
      })
    ).json()
    userService.findById.mockResolvedValueOnce({
      deletionRequestedAt: new Date(),
      id: user.id,
    })

    const response = await tokenGrant(auth, {
      grantType: "refresh_token",
      refreshToken: login.refreshToken,
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      code: "ACCOUNT_DELETION_PENDING",
    })
    expect(refreshService.revokeAllForUser).toHaveBeenCalledWith({
      userId: user.id,
    })
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
