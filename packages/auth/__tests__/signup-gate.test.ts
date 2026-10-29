import type * as BetterAuth from "better-auth"

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { betterAuthMock, findActiveByCodeMock } = vi.hoisted(() => ({
  betterAuthMock: vi.fn((config: Record<string, unknown>) => config),
  findActiveByCodeMock: vi.fn(),
}))

vi.mock("better-auth", async () => {
  const actual = await vi.importActual<BetterAuth>("better-auth")
  return { ...actual, betterAuth: betterAuthMock }
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
  genericOAuth: () => ({ id: "generic-oauth" }),
  mcp: () => ({ id: "mcp" }),
  magicLink: () => ({ id: "magic-link" }),
  oneTimeToken: () => ({ id: "one-time-token" }),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))

vi.mock("@chatbotx.io/database/schema", () => ({
  accountModel: {},
  oauthAccessTokenModel: {},
  oauthApplicationModel: {},
  oauthConsentModel: {},
  sessionModel: {},
  userModel: {},
  verificationModel: {},
}))

vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { listActiveDomains: vi.fn().mockResolvedValue([]) },
  invitationService: { findActiveByCode: findActiveByCodeMock },
  platformCredentialService: {
    findDecryptedPlatform: vi.fn(),
    findPlatform: vi.fn(),
  },
  resolveTenantSettingsByDomain: vi.fn(),
}))

vi.mock("../src/tenant-context", () => ({
  getTenantId: () => "tenant-a",
  resolveTenantOwnerId: vi.fn(),
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

type UserCreateBeforeHook = (
  user: Record<string, unknown>,
  context: { getCookie: (name: string) => string | undefined } | null,
) => Promise<unknown>

type BeforeHook = (context: {
  path: string
  body?: { email?: string }
  getCookie: (name: string) => string | undefined
  headers?: Headers
}) => Promise<unknown>

const getHooks = async (): Promise<{
  userCreateBefore: UserCreateBeforeHook
  emailRequestBefore: BeforeHook
}> => {
  // Module reset lets each case load server configuration from its own env.
  const { createAuth } = await import("../src/server")
  createAuth({})
  const config = betterAuthMock.mock.calls.at(-1)?.[0] as {
    databaseHooks: { user: { create: { before: UserCreateBeforeHook } } }
    hooks: { before: BeforeHook }
  }
  return {
    userCreateBefore: config.databaseHooks.user.create.before,
    emailRequestBefore: config.hooks.before,
  }
}

describe("signup lockdown", () => {
  beforeEach(() => {
    vi.resetModules()
    betterAuthMock.mockClear()
    findActiveByCodeMock.mockReset()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("NEXT_PUBLIC_BUILDER_URL", "https://app.example.com")
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })
  test("allows normal user creation when signup lockdown is disabled", async () => {
    vi.stubEnv("AUTH_DISABLE_SIGNUP", "false")
    const { userCreateBefore } = await getHooks()

    await expect(userCreateBefore({}, null)).resolves.toBeUndefined()
  })

  test("rejects non-anonymous user creation without an active invitation", async () => {
    vi.stubEnv("AUTH_DISABLE_SIGNUP", "true")
    findActiveByCodeMock.mockResolvedValue(null)
    const { userCreateBefore } = await getHooks()

    await expect(userCreateBefore({}, null)).rejects.toMatchObject({
      message: "signup_disabled",
    })
  })

  test("keeps anonymous sessions available during signup lockdown", async () => {
    vi.stubEnv("AUTH_DISABLE_SIGNUP", "true")
    const { userCreateBefore } = await getHooks()

    await expect(
      userCreateBefore({ isAnonymous: true }, null),
    ).resolves.toBeUndefined()
  })

  test("allows only a live invitation cookie during signup lockdown", async () => {
    vi.stubEnv("AUTH_DISABLE_SIGNUP", "true")
    const { userCreateBefore } = await getHooks()
    const context = { getCookie: () => "invite-code" }

    findActiveByCodeMock.mockResolvedValue({ id: "invite" })
    await expect(userCreateBefore({}, context)).resolves.toBeUndefined()
    expect(findActiveByCodeMock).toHaveBeenLastCalledWith("invite-code", {
      tenantId: "tenant-a",
    })

    findActiveByCodeMock.mockResolvedValue(null)
    await expect(userCreateBefore({}, context)).rejects.toMatchObject({
      message: "signup_disabled",
    })
  })

  test("rejects a cookie whose invitation belongs to a different tenant", async () => {
    vi.stubEnv("AUTH_DISABLE_SIGNUP", "true")
    findActiveByCodeMock.mockResolvedValue(null)
    const { userCreateBefore } = await getHooks()

    await expect(
      userCreateBefore({}, { getCookie: () => "other-tenant-invite" }),
    ).rejects.toMatchObject({ message: "signup_disabled" })
    expect(findActiveByCodeMock).toHaveBeenCalledWith("other-tenant-invite", {
      tenantId: "tenant-a",
    })
  })

  test("blocks email signup but leaves existing email sign-in alone", async () => {
    vi.stubEnv("AUTH_DISABLE_SIGNUP", "true")
    const { emailRequestBefore } = await getHooks()
    const context = {
      body: { email: "new@example.com" },
      getCookie: () => undefined,
    }

    await expect(
      emailRequestBefore({ ...context, path: "/sign-up/email" }),
    ).rejects.toMatchObject({ message: "Sign-up is disabled" })
    await expect(
      emailRequestBefore({ ...context, path: "/sign-in/email" }),
    ).resolves.toBeUndefined()
  })

  test("allows /sign-up/email through the middleware hook when the request carries a live invitation cookie", async () => {
    // The middleware's real `ctx` (better-call's internal endpoint context)
    // always derives `getCookie` from the request's `Cookie` header itself —
    // it ignores any `getCookie` passed in, unlike the db-hook context used
    // above. A fake `getCookie` here would pass without proving the real
    // middleware context can read the cookie at all.
    vi.stubEnv("AUTH_DISABLE_SIGNUP", "true")
    findActiveByCodeMock.mockResolvedValue({ id: "invite" })
    const { emailRequestBefore } = await getHooks()

    await expect(
      emailRequestBefore({
        path: "/sign-up/email",
        body: { email: "new@example.com" },
        getCookie: () => undefined,
        headers: new Headers({ cookie: "chatbotx_invitation=invite-code" }),
      }),
    ).resolves.toBeUndefined()
    expect(findActiveByCodeMock).toHaveBeenLastCalledWith("invite-code", {
      tenantId: "tenant-a",
    })
  })
})
