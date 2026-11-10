import { createHash } from "node:crypto"

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Hoisted mock handles. `vi.mock` factories run before module top-level, so any
 * value a factory references must be created with `vi.hoisted`.
 */
const {
  betterAuthMock,
  createRemoteJWKSetMock,
  jwtVerifyMock,
  listActiveDomains,
} = vi.hoisted(() => ({
  betterAuthMock: vi.fn((config: Record<string, unknown>) => config),
  createRemoteJWKSetMock: vi.fn(() => "apple-jwks"),
  jwtVerifyMock: vi.fn(),
  listActiveDomains: vi.fn(),
}))

vi.mock("better-auth", async () => {
  const actual =
    await vi.importActual<typeof import("better-auth")>("better-auth")
  return {
    ...actual,
    betterAuth: betterAuthMock,
  }
})

vi.mock("jose", () => ({
  createRemoteJWKSet: createRemoteJWKSetMock,
  jwtVerify: jwtVerifyMock,
}))

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: () => ({}),
}))

vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}))

vi.mock("better-auth/plugins", () => ({
  anonymous: () => ({ id: "anonymous" }),
  bearer: () => ({ id: "bearer" }),
  genericOAuth: () => ({ id: "generic-oauth" }),
  jwt: () => ({ id: "jwt" }),
  mcp: () => ({ id: "mcp" }),
  magicLink: () => ({ id: "magic-link" }),
  oneTimeToken: () => ({ id: "one-time-token" }),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  accountModel: {},
  jwkModel: {},
  oauthAccessTokenModel: {},
  oauthClientAssertionModel: {},
  oauthClientModel: {},
  oauthClientResourceModel: {},
  oauthConsentModel: {},
  oauthRefreshTokenModel: {},
  oauthResourceModel: {},
  sessionModel: {},
  userModel: {},
  verificationModel: {},
}))

vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { listActiveDomains },
  platformCredentialService: {
    findDecryptedPlatform: vi.fn(),
    findPlatform: vi.fn(),
  },
  resolveTenantSettingsByDomain: vi.fn(),
  invitationService: { findActiveByCode: vi.fn().mockResolvedValue(null) },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "test-id",
  getPublicOriginFromRequest: vi.fn(),
  parseEnvBool: (value: unknown) => value === true || value === "true",
}))

vi.mock("@chatbotx.io/mail", () => ({
  DEFAULT_FORGOT_PASSWORD_SUBJECT: "reset",
  DEFAULT_MAGIC_LINK_SUBJECT: "magic",
  DEFAULT_SIGNUP_SUBJECT: "signup",
  sendMagicLink: vi.fn(),
  sendResetPassword: vi.fn(),
  sendSignUpVerification: vi.fn(),
}))

const BROKER_URL = "https://broker.example.com"
const BUILDER_URL = "https://app.example.com"

type AppleConfig = {
  clientId: string
  clientSecret: string
  audience: string[]
  appBundleIdentifier: string
  verifyIdToken: (token: string, nonce?: string) => Promise<boolean>
}
type ProvidersConfig = {
  socialProviders?: Record<string, unknown> & { apple?: AppleConfig }
}

const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex")

describe("createAuth — native Apple provider (APPLE_APP_BUNDLE_IDS)", () => {
  beforeEach(() => {
    vi.resetModules()
    betterAuthMock.mockClear()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("NEXT_PUBLIC_BUILDER_URL", BUILDER_URL)
    vi.stubEnv("NEXT_PUBLIC_BROKER_URL", BROKER_URL)
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
    vi.stubEnv("NEXT_PHASE", "")
    createRemoteJWKSetMock.mockClear()
    jwtVerifyMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const buildConfig = async (
    socialCredentials?: Parameters<
      typeof import("../src/server").createAuth
    >[0]["socialCredentials"],
  ) => {
    const { createAuth } = await import("../src/server")
    createAuth({ socialCredentials })
    return betterAuthMock.mock.calls[0]?.[0] as ProvidersConfig
  }

  test("registers apple with every bundle id as the audience and no client secret", async () => {
    vi.stubEnv(
      "APPLE_APP_BUNDLE_IDS",
      " com.brand.a , com.brand.b,,com.brand.a",
    )

    const config = await buildConfig()

    expect(config.socialProviders?.apple).toMatchObject({
      clientId: "com.brand.a",
      clientSecret: "",
      audience: ["com.brand.a", "com.brand.b"],
      appBundleIdentifier: "com.brand.a",
    })
  })

  test("is not registered when APPLE_APP_BUNDLE_IDS is unset or blank", async () => {
    expect((await buildConfig()).socialProviders).toBeUndefined()

    vi.resetModules()

    betterAuthMock.mockClear()
    vi.stubEnv("APPLE_APP_BUNDLE_IDS", " , ")

    expect((await buildConfig()).socialProviders).toBeUndefined()
  })
  test("verifies matching Apple nonces against one cached remote key set", async () => {
    vi.stubEnv("APPLE_APP_BUNDLE_IDS", "com.brand.a,com.brand.b")
    const config = await buildConfig()
    const verifyIdToken = config.socialProviders?.apple?.verifyIdToken

    expect(verifyIdToken).toBeTypeOf("function")
    if (!verifyIdToken) {
      throw new Error("Apple provider should verify native identity tokens")
    }

    await expect(verifyIdToken("token", undefined)).resolves.toBe(false)
    expect(jwtVerifyMock).not.toHaveBeenCalled()

    jwtVerifyMock
      .mockResolvedValueOnce({ payload: { nonce: sha256Hex("raw-nonce") } })
      .mockResolvedValueOnce({ payload: { nonce: "raw-nonce" } })
      .mockResolvedValueOnce({ payload: { nonce: "wrong-nonce" } })
      .mockResolvedValueOnce({ payload: {} })
      .mockRejectedValueOnce(new Error("wrong audience"))

    await expect(verifyIdToken("token", "raw-nonce")).resolves.toBe(true)
    await expect(verifyIdToken("token", "raw-nonce")).resolves.toBe(true)
    await expect(verifyIdToken("token", "raw-nonce")).resolves.toBe(false)
    await expect(verifyIdToken("token", "raw-nonce")).resolves.toBe(false)
    await expect(verifyIdToken("token", "raw-nonce")).resolves.toBe(false)

    expect(createRemoteJWKSetMock).toHaveBeenCalledTimes(1)
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      "token",
      "apple-jwks",
      expect.objectContaining({
        algorithms: ["RS256"],
        audience: ["com.brand.a", "com.brand.b"],
        clockTolerance: 30,
        issuer: "https://appleid.apple.com",
        maxTokenAge: "1h",
        requiredClaims: ["iss", "sub", "aud", "exp", "iat"],
      }),
    )
  })

  test("coexists with the per-tenant social providers without touching them", async () => {
    vi.stubEnv("APPLE_APP_BUNDLE_IDS", "com.brand.a")

    const config = await buildConfig({
      google: { clientId: "id-1", clientSecret: "secret-1" },
    })

    expect(Object.keys(config.socialProviders ?? {}).sort()).toEqual([
      "apple",
      "google",
    ])
  })

  test("is skipped during the production build phase", async () => {
    vi.stubEnv("APPLE_APP_BUNDLE_IDS", "com.brand.a")
    vi.stubEnv("NEXT_PHASE", "phase-production-build")

    expect((await buildConfig()).socialProviders).toBeUndefined()
  })
})
