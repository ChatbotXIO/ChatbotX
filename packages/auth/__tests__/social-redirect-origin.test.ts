import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Hoisted mock handles. `vi.mock` factories run before module top-level, so any
 * value a factory references must be created with `vi.hoisted`.
 */
const { listActiveDomains, betterAuthMock } = vi.hoisted(() => ({
  listActiveDomains: vi.fn(),
  betterAuthMock: vi.fn((config: Record<string, unknown>) => config),
}))

vi.mock("better-auth", async () => {
  const actual =
    await vi.importActual<typeof import("better-auth")>("better-auth")
  return {
    ...actual,
    betterAuth: betterAuthMock,
  }
})

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: () => ({}),
}))

vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}))

vi.mock("better-auth/plugins", () => ({
  anonymous: () => ({ id: "anonymous" }),
  bearer: () => ({ id: "bearer" }),
  magicLink: () => ({ id: "magic-link" }),
  oneTimeToken: () => ({ id: "one-time-token" }),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  accountModel: {},
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
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "test-id",
  getPublicOriginFromRequest: vi.fn(),
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

type SocialProvidersConfig = {
  socialProviders?: Record<string, { redirectURI: string }>
}

describe("buildSocialProviders — socialRedirectOrigin", () => {
  beforeEach(() => {
    vi.resetModules()
    betterAuthMock.mockClear()
    listActiveDomains.mockReset()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("NEXT_PUBLIC_BUILDER_URL", BUILDER_URL)
    vi.stubEnv("NEXT_PUBLIC_BROKER_URL", BROKER_URL)
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
    vi.stubEnv("NEXT_PHASE", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("pins redirectURI to the broker origin when socialRedirectOrigin is omitted", async () => {
    const { createAuth } = await import("../src/server")
    createAuth({
      socialCredentials: {
        google: { clientId: "id-1", clientSecret: "secret-1" },
      },
    })

    const config = betterAuthMock.mock.calls[0]?.[0] as SocialProvidersConfig
    expect(config.socialProviders?.google?.redirectURI).toBe(
      `${BROKER_URL}/api/auth/callback/google`,
    )
  })

  test("pins redirectURI to the caller-supplied socialRedirectOrigin (tenant custom domain)", async () => {
    const { createAuth } = await import("../src/server")
    createAuth({
      socialCredentials: {
        google: { clientId: "id-1", clientSecret: "secret-1" },
      },
      socialRedirectOrigin: "https://chat.acme.com",
    })

    const config = betterAuthMock.mock.calls[0]?.[0] as SocialProvidersConfig
    expect(config.socialProviders?.google?.redirectURI).toBe(
      "https://chat.acme.com/api/auth/callback/google",
    )
  })

  test("applies socialRedirectOrigin to every enabled provider", async () => {
    const { createAuth } = await import("../src/server")
    createAuth({
      socialCredentials: {
        google: { clientId: "id-1", clientSecret: "secret-1" },
        facebook: { clientId: "id-2", clientSecret: "secret-2" },
      },
      socialRedirectOrigin: "https://chat.acme.com",
    })

    const config = betterAuthMock.mock.calls[0]?.[0] as SocialProvidersConfig
    expect(config.socialProviders?.google?.redirectURI).toBe(
      "https://chat.acme.com/api/auth/callback/google",
    )
    expect(config.socialProviders?.facebook?.redirectURI).toBe(
      "https://chat.acme.com/api/auth/callback/facebook",
    )
  })
})
