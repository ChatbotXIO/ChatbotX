import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Hoisted mock handles. `vi.mock` factories run before module top-level, so any
 * value a factory references must be created with `vi.hoisted`.
 */
const { betterAuthMock } = vi.hoisted(() => ({
  betterAuthMock: vi.fn((config: Record<string, unknown>) => config),
}))

// Mirrors trusted-origins-build-phase.test.ts's approach: stub `betterAuth` to
// just hand back its config object so we can inspect the `plugins` array
// without booting a real better-auth instance (which needs a live DB).
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
  customDomainService: { listActiveDomains: vi.fn().mockResolvedValue([]) },
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

describe("bearer plugin wiring", () => {
  beforeEach(() => {
    vi.resetModules()
    betterAuthMock.mockClear()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("NEXT_PUBLIC_BUILDER_URL", BUILDER_URL)
    vi.stubEnv("NEXT_PUBLIC_BROKER_URL", BROKER_URL)
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
    vi.stubEnv("NEXT_PHASE", "phase-production-build")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("registers the bearer plugin after oneTimeToken and before nextCookies", async () => {
    const { createAuth } = await import("../src/server")
    createAuth({})

    const config = betterAuthMock.mock.calls[0]?.[0] as {
      plugins: Array<{ id: string }>
    }
    const ids = config.plugins.map((plugin) => plugin.id)

    const oneTimeTokenIndex = ids.indexOf("one-time-token")
    const bearerIndex = ids.indexOf("bearer")
    const nextCookiesIndex = ids.indexOf("next-cookies")

    expect(bearerIndex).toBeGreaterThan(-1)
    expect(bearerIndex).toBeGreaterThan(oneTimeTokenIndex)
    // nextCookies must stay last so it mirrors every other plugin's cookie
    // writes, including bearer's `set-auth-token` response header.
    expect(nextCookiesIndex).toBe(ids.length - 1)
    expect(bearerIndex).toBeLessThan(nextCookiesIndex)
  })
})
