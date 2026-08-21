import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Hoisted mock handles. `vi.mock` factories run before module top-level, so any
 * value a factory references must be created with `vi.hoisted`.
 */
const { listActiveDomains, betterAuthMock } = vi.hoisted(() => ({
  listActiveDomains: vi.fn(),
  betterAuthMock: vi.fn((config: Record<string, unknown>) => config),
}))

// better-auth's real init eagerly resolves `trustedOrigins` at instance
// creation, which is the exact behavior under test (see server.ts). Stub it
// to just hand back the config object so we can extract and call the
// `trustedOrigins` thunk ourselves without booting a real better-auth instance.
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

// @chatbotx.io/utils sets up a process-global Snowflake ID generator at
// module scope; re-importing it after `vi.resetModules()` collides on the
// same "Place ID" and throws. Stub it since these tests never generate ids.
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

describe("trustedOrigins during next build", () => {
  beforeEach(() => {
    vi.resetModules()
    betterAuthMock.mockClear()
    listActiveDomains.mockReset()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("NEXT_PUBLIC_BUILDER_URL", BUILDER_URL)
    vi.stubEnv("NEXT_PUBLIC_BROKER_URL", BROKER_URL)
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("skips the CustomDomain lookup when NEXT_PHASE is phase-production-build", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build")

    const { createAuth } = await import("../src/server")
    createAuth({})

    const config = betterAuthMock.mock.calls[0]?.[0] as {
      trustedOrigins: () => Promise<string[]>
    }
    const origins = await config.trustedOrigins()

    expect(origins).toEqual(expect.arrayContaining([BROKER_URL, BUILDER_URL]))
    expect(origins).toHaveLength(2)
    expect(listActiveDomains).not.toHaveBeenCalled()
  })

  test("includes active custom domains outside the build phase", async () => {
    vi.stubEnv("NEXT_PHASE", "")
    listActiveDomains.mockResolvedValue(["custom.example.com"])

    const { createAuth } = await import("../src/server")
    createAuth({})

    const config = betterAuthMock.mock.calls[0]?.[0] as {
      trustedOrigins: () => Promise<string[]>
    }
    const origins = await config.trustedOrigins()

    expect(listActiveDomains).toHaveBeenCalledTimes(1)
    expect(origins).toEqual(
      expect.arrayContaining([
        BROKER_URL,
        BUILDER_URL,
        "https://custom.example.com",
      ]),
    )
  })
})
