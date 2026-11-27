import { createHash } from "node:crypto"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"
import { jwt } from "better-auth/plugins"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { createAppleIdTokenVerifier } from "../src/apple-id-token"

const ISSUER = "https://app.example.com"
const AUDIENCE = "https://app.example.com/api"
const APPLE_ISSUER = "https://appleid.apple.com"
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
const BUNDLE_ID = "com.example.brand-a"
const OTHER_BUNDLE_ID = "com.example.brand-b"
const APPLE_SUB = "001234.abcdef.5678"
const KEY_ID = "apple-test-key"
const DEFAULT_NONCE = "native-test-nonce"
const ONE_HOUR_SECONDS = 3600
const RSA_ALGORITHM = {
  name: "RSASSA-PKCS1-v1_5",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
} as const

const { refreshService, userService } = vi.hoisted(() => ({
  refreshService: {
    issue: vi.fn(async () => ({
      token: "rt-1",
      expiresAt: new Date(Date.now() + 86_400_000),
    })),
    rotate: vi.fn(),
    revokeByToken: vi.fn(),
    revokeAllForUser: vi.fn(),
  },
  userService: {
    clearMustChangePassword: vi.fn(),
    findById: vi.fn(async (id: string) => ({
      deletionRequestedAt: null,
      id,
    })),
  },
}))

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

const generateKeyPair = () =>
  crypto.subtle.generateKey(RSA_ALGORITHM, true, ["sign", "verify"])

const appleKeyPair = await generateKeyPair()
const attackerKeyPair = await generateKeyPair()
const applePublicJwk = {
  ...(await crypto.subtle.exportKey("jwk", appleKeyPair.publicKey)),
  kid: KEY_ID,
  alg: "RS256",
  use: "sig",
}

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url")

const nowSeconds = () => Math.floor(Date.now() / 1000)

const signAppleToken = async (
  claims: Record<string, unknown> = {},
  signingKey: CryptoKey = appleKeyPair.privateKey,
) => {
  const payload = {
    iss: APPLE_ISSUER,
    aud: BUNDLE_ID,
    sub: APPLE_SUB,
    iat: nowSeconds(),
    exp: nowSeconds() + ONE_HOUR_SECONDS,
    nonce: sha256Hex(DEFAULT_NONCE),
    email: "agent@example.com",
    email_verified: true,
    ...claims,
  }
  const signingInput = `${encode({ alg: "RS256", kid: KEY_ID })}.${encode(payload)}`
  const signature = await crypto.subtle.sign(
    RSA_ALGORITHM.name,
    signingKey,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`
}

const tables = () => ({
  user: [] as Record<string, unknown>[],
  session: [] as Record<string, unknown>[],
  account: [] as Record<string, unknown>[],
  verification: [] as Record<string, unknown>[],
  jwks: [] as Record<string, unknown>[],
})

type AuthOptions = {
  bundleIds?: string[]
  signUpDisabled?: boolean
  implicitSignUpDisabled?: boolean
}

const createAppleAuth = (
  store: ReturnType<typeof tables>,
  {
    bundleIds = [BUNDLE_ID],
    signUpDisabled = false,
    implicitSignUpDisabled = false,
  }: AuthOptions = {},
) =>
  betterAuth({
    baseURL: ISSUER,
    secret: "a-very-long-test-secret-for-better-auth-0123456789",
    database: memoryAdapter(store),
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    // Mirrors `createAuth`: Apple is verified natively, so there is no client
    // secret and the web redirect flow cannot start.
    socialProviders:
      bundleIds.length > 0
        ? {
            apple: {
              clientId: bundleIds[0] as string,
              clientSecret: "",
              audience: bundleIds,
              appBundleIdentifier: bundleIds[0],
              verifyIdToken: createAppleIdTokenVerifier(bundleIds),
              disableSignUp: signUpDisabled,
              disableImplicitSignUp: implicitSignUpDisabled,
            },
          }
        : undefined,
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["apple"],
        requireLocalEmailVerified: false,
      },
    },
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

type TestAuth = ReturnType<typeof createAppleAuth>

const appleGrant = (auth: TestAuth, body: Record<string, unknown>) =>
  auth.handler(
    new Request(`${ISSUER}/api/auth/mobile/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "id_token",
        provider: "apple",
        nonce: DEFAULT_NONCE,
        ...body,
      }),
    }),
  )

const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex")

const realFetch = globalThis.fetch
let store: ReturnType<typeof tables>

beforeEach(() => {
  vi.clearAllMocks()
  store = tables()
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === APPLE_KEYS_URL) {
      return Promise.resolve(Response.json({ keys: [applePublicJwk] }))
    }
    return realFetch(input, init)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST /mobile/token — id_token grant (Apple)", () => {
  test("a valid token for a new user creates the user and an apple account, returns the token response, and leaves no session", async () => {
    const auth = createAppleAuth(store)

    const response = await appleGrant(auth, {
      idToken: await signAppleToken(),
      user: { name: { firstName: "Ada", lastName: "Lovelace" } },
      deviceId: "install-1",
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const body = await response.json()
    expect(body).toMatchObject({
      tokenType: "Bearer",
      refreshToken: "rt-1",
      deviceId: "install-1",
      mustChangePassword: false,
    })
    expect(store.user).toHaveLength(1)
    expect(store.user[0]).toMatchObject({
      email: "agent@example.com",
      name: "Ada Lovelace",
      emailVerified: true,
    })
    expect(store.account).toEqual([
      expect.objectContaining({
        providerId: "apple",
        accountId: APPLE_SUB,
        userId: store.user[0]?.id,
      }),
    ])
    expect(store.session).toHaveLength(0)
    expect(refreshService.issue).toHaveBeenCalledWith({
      userId: store.user[0]?.id,
      deviceId: "install-1",
    })
  })

  test("generates a device id when none is sent", async () => {
    const auth = createAppleAuth(store)

    const response = await appleGrant(auth, { idToken: await signAppleToken() })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(typeof body.deviceId).toBe("string")
    expect(body.deviceId.length).toBeGreaterThan(0)
  })

  test("a verified existing user with the same email is linked, not duplicated", async () => {
    const auth = createAppleAuth(store)
    const ctx = await auth.$context
    const existing = await ctx.internalAdapter.createUser({
      email: "agent@example.com",
      name: "Agent",
      emailVerified: true,
    })

    const response = await appleGrant(auth, { idToken: await signAppleToken() })

    expect(response.status).toBe(200)
    expect(store.user).toHaveLength(1)
    expect(store.account).toEqual([
      expect.objectContaining({
        providerId: "apple",
        accountId: APPLE_SUB,
        userId: existing.id,
      }),
    ])
    expect(refreshService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: existing.id }),
    )
  })

  test("a repeat sign-in reuses the same user and account", async () => {
    const auth = createAppleAuth(store)

    await appleGrant(auth, { idToken: await signAppleToken() })
    const response = await appleGrant(auth, {
      idToken: await signAppleToken(),
    })

    expect(response.status).toBe(200)
    expect(store.user).toHaveLength(1)
    expect(store.account).toHaveLength(1)
    expect(store.session).toHaveLength(0)
  })

  test("accepts a private relay email", async () => {
    const auth = createAppleAuth(store)

    const response = await appleGrant(auth, {
      idToken: await signAppleToken({
        email: "abc123@privaterelay.appleid.com",
        is_private_email: true,
      }),
    })

    expect(response.status).toBe(200)
    expect(store.user[0]).toMatchObject({
      email: "abc123@privaterelay.appleid.com",
    })
  })

  test('treats email_verified "true" (string) as verified', async () => {
    const auth = createAppleAuth(store)

    const response = await appleGrant(auth, {
      idToken: await signAppleToken({ email_verified: "true" }),
    })

    expect(response.status).toBe(200)
    expect(store.user[0]).toMatchObject({ emailVerified: true })
  })

  test("accepts any configured bundle id as the audience", async () => {
    const auth = createAppleAuth(store, {
      bundleIds: [BUNDLE_ID, OTHER_BUNDLE_ID],
    })

    const response = await appleGrant(auth, {
      idToken: await signAppleToken({ aud: OTHER_BUNDLE_ID }),
    })

    expect(response.status).toBe(200)
  })

  describe("nonce", () => {
    test.each([
      ["missing", undefined],
      ["empty", ""],
    ])("rejects a %s nonce during request validation", async (_description, nonce) => {
      const auth = createAppleAuth(store)

      const response = await appleGrant(auth, {
        idToken: await signAppleToken(),
        nonce,
      })

      expect(response.status).toBe(400)
      expect(store.user).toHaveLength(0)
    })

    test("rejects a token whose nonce claim is the raw nonce", async () => {
      const auth = createAppleAuth(store)

      const response = await appleGrant(auth, {
        idToken: await signAppleToken({ nonce: "raw-nonce" }),
        nonce: "raw-nonce",
      })

      expect(response.status).toBe(401)
      expect((await response.json()).code).toBe("INVALID_ID_TOKEN")
      expect(store.user).toHaveLength(0)
    })

    test("accepts the nonce when the token carries its SHA-256 hex", async () => {
      const auth = createAppleAuth(store)

      const response = await appleGrant(auth, {
        idToken: await signAppleToken({ nonce: sha256Hex("raw-nonce") }),
        nonce: "raw-nonce",
      })

      expect(response.status).toBe(200)
    })

    test("rejects a nonce that does not match the token", async () => {
      const auth = createAppleAuth(store)

      const response = await appleGrant(auth, {
        idToken: await signAppleToken({ nonce: sha256Hex("raw-nonce") }),
        nonce: "another-nonce",
      })

      expect(response.status).toBe(401)
      expect((await response.json()).code).toBe("INVALID_ID_TOKEN")
      expect(store.user).toHaveLength(0)
    })
  })

  describe("invalid tokens are 401 INVALID_ID_TOKEN and create nothing", () => {
    test.each([
      ["wrong audience", () => signAppleToken({ aud: "com.attacker.app" })],
      [
        "wrong issuer",
        () => signAppleToken({ iss: "https://evil.example.com" }),
      ],
      [
        "expired",
        () =>
          signAppleToken({
            iat: nowSeconds() - 7200,
            exp: nowSeconds() - 3600,
          }),
      ],
      [
        "forged signature",
        () => signAppleToken({}, attackerKeyPair.privateKey),
      ],
      ["not a JWT", () => Promise.resolve("not-a-jwt")],
    ])("%s", async (_name, makeToken) => {
      const auth = createAppleAuth(store)

      const response = await appleGrant(auth, { idToken: await makeToken() })

      expect(response.status).toBe(401)
      expect((await response.json()).code).toBe("INVALID_ID_TOKEN")
      expect(store.user).toHaveLength(0)
      expect(store.account).toHaveLength(0)
      expect(refreshService.issue).not.toHaveBeenCalled()
    })
  })
  test("rejects a token with an empty subject", async () => {
    const auth = createAppleAuth(store)

    const response = await appleGrant(auth, {
      idToken: await signAppleToken({ sub: "" }),
    })

    expect(response.status).toBe(401)
    expect((await response.json()).code).toBe("INVALID_ID_TOKEN")
    expect(store.user).toHaveLength(0)
  })

  test("a token without an email is 401", async () => {
    const auth = createAppleAuth(store)

    const response = await appleGrant(auth, {
      idToken: await signAppleToken({ email: undefined }),
    })

    expect(response.status).toBe(401)
    expect(store.user).toHaveLength(0)
  })

  test("a token whose email is not verified is 403 EMAIL_NOT_VERIFIED and creates nothing", async () => {
    const auth = createAppleAuth(store)

    const response = await appleGrant(auth, {
      idToken: await signAppleToken({ email_verified: false }),
    })

    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe("EMAIL_NOT_VERIFIED")
    expect(store.user).toHaveLength(0)
    expect(store.account).toHaveLength(0)
  })

  test("is 404 PROVIDER_NOT_ENABLED when no bundle id is configured", async () => {
    const auth = createAppleAuth(store, { bundleIds: [] })

    const response = await appleGrant(auth, { idToken: await signAppleToken() })

    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe("PROVIDER_NOT_ENABLED")
  })

  describe("signup lockdown", () => {
    test.each([
      ["signup is disabled", { signUpDisabled: true }],
      ["implicit signup is disabled", { implicitSignUpDisabled: true }],
    ])("a new user is rejected when %s", async (_reason, authOptions) => {
      const auth = createAppleAuth(store, authOptions)

      const response = await appleGrant(auth, {
        idToken: await signAppleToken(),
      })

      expect(response.status).toBe(401)
      expect((await response.json()).code).toBe("OAUTH_LINK_ERROR")
      expect(store.user).toHaveLength(0)
    })

    test("an existing apple user can still sign in", async () => {
      await appleGrant(createAppleAuth(store), {
        idToken: await signAppleToken(),
      })

      const response = await appleGrant(
        createAppleAuth(store, { signUpDisabled: true }),
        { idToken: await signAppleToken() },
      )

      expect(response.status).toBe(200)
      expect(store.user).toHaveLength(1)
    })
  })

  test("rejects an unsupported provider and a missing idToken", async () => {
    const auth = createAppleAuth(store)

    const unsupported = await appleGrant(auth, {
      provider: "google",
      idToken: await signAppleToken(),
    })
    const missing = await appleGrant(auth, {})

    expect(unsupported.status).toBe(400)
    expect(missing.status).toBe(400)
  })
})
