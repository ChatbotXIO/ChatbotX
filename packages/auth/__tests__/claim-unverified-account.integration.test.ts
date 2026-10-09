import type { BetterAuthOptions } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"
import { createInternalAdapter } from "better-auth/db"
import { beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Hoisted mock handles. `vi.mock` factories run before module top-level, so any
 * value a factory references must be created with `vi.hoisted`.
 */
const { betterAuthMock } = vi.hoisted(() => ({
  betterAuthMock: vi.fn((config: Record<string, unknown>) => config),
}))

// Mirrors trusted-origins-build-phase.test.ts's approach: stub `betterAuth` to
// just hand back its config object so we can inspect `advanced.database` /
// `databaseHooks` without booting a real better-auth instance (which needs a
// live DB).
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
  ROOT_TENANT_ID: "1",
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

vi.mock("@chatbotx.io/utils", async () => {
  const actual =
    await vi.importActual<typeof import("@chatbotx.io/utils")>(
      "@chatbotx.io/utils",
    )
  return { ...actual, getPublicOriginFromRequest: vi.fn() }
})

vi.mock("@chatbotx.io/mail", () => ({
  DEFAULT_FORGOT_PASSWORD_SUBJECT: "reset",
  DEFAULT_MAGIC_LINK_SUBJECT: "magic",
  DEFAULT_SIGNUP_SUBJECT: "signup",
  sendMagicLink: vi.fn(),
  sendResetPassword: vi.fn(),
  sendSignUpVerification: vi.fn(),
}))

type Row = Record<string, unknown>
type BeforeHook = (account: Row, context: unknown) => Promise<unknown>

const now = () => new Date()
const TEN_MINUTES_MS = 600_000
const EMAIL_ATTESTING_ERROR = /email-attesting/

/**
 * Real `createInternalAdapter` over the memory adapter, with the
 * `databaseHooks` the real `createAuth({})` config registers. The hooks are
 * invoked by better-auth's own `createWithHooks`; the only stand-in is the
 * endpoint context (normally supplied by an HTTP request's AsyncLocalStorage),
 * which we hand the hook so it can reach the same internal adapter.
 */
const setup = async (
  seed: { user?: Row[]; account?: Row[]; session?: Row[] } = {},
) => {
  const { createAuth } = await import("../src/server")
  createAuth({})
  const config = betterAuthMock.mock.calls.at(-1)?.[0] as BetterAuthOptions
  const store = {
    user: seed.user ?? [],
    account: seed.account ?? [],
    session: seed.session ?? [],
    verification: [] as Row[],
  }
  const adapter = memoryAdapter(store)(config as never)
  const realBefore = config.databaseHooks?.account?.create
    ?.before as unknown as BeforeHook
  const holder: { internal?: unknown } = {}
  const internal = createInternalAdapter(adapter, {
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    options: config,
    hooks: [
      {
        source: "test",
        hooks: {
          account: {
            create: {
              before: (account: Row) =>
                realBefore(account, {
                  context: { internalAdapter: holder.internal, adapter },
                }),
            },
          },
        },
      },
    ],
  } as never)
  holder.internal = internal
  return { internal, store }
}

const placeholder = {
  id: "u1",
  email: "victim@example.test",
  name: "victim",
  emailVerified: false,
  createdAt: new Date(Date.now() - TEN_MINUTES_MS),
  updatedAt: now(),
}
const sessionRow = (id: string) => ({
  id,
  userId: "u1",
  token: `tok-${id}`,
  expiresAt: new Date(Date.now() + TEN_MINUTES_MS),
  createdAt: now(),
  updatedAt: now(),
})
const credentialRow = {
  id: "acc-pwd",
  userId: "u1",
  providerId: "credential",
  accountId: "u1",
  password: "attacker-hash",
  createdAt: now(),
  updatedAt: now(),
}
const DID_NOT_ATTEST_ERROR = /did not attest/
const idTokenWith = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`
const social = (providerId: string, idToken?: string) => ({
  userId: "u1",
  providerId,
  accountId: "sub-1",
  ...(idToken !== undefined && { idToken }),
})

describe("claimUnverifiedAccountBeforeLink through the real internal adapter", () => {
  beforeEach(() => {
    vi.resetModules()
    betterAuthMock.mockClear()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("NEXT_PUBLIC_BUILDER_URL", "https://app.example.com")
    vi.stubEnv("NEXT_PUBLIC_BROKER_URL", "https://broker.example.com")
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
    vi.stubEnv("NEXT_PHASE", "phase-production-build")
  })

  test("linking Google into an unverified user removes its credential row and inserts the Google row", async () => {
    const { internal, store } = await setup({
      user: [placeholder],
      account: [credentialRow],
    })
    await internal.linkAccount(
      social("google", idTokenWith({ email_verified: true })),
    )
    expect(store.account.map((a) => a.providerId)).toEqual(["google"])
  })

  test("a Google claim revokes every session of the placeholder", async () => {
    const { internal, store } = await setup({
      user: [placeholder],
      account: [credentialRow],
      session: [sessionRow("s1"), sessionRow("s2")],
    })
    await internal.linkAccount(
      social("google", idTokenWith({ email_verified: true })),
    )
    expect(store.session).toHaveLength(0)
  })

  test("linking Google whose token is not email_verified is refused and writes nothing", async () => {
    const { internal, store } = await setup({
      user: [placeholder],
      account: [credentialRow],
    })
    await expect(
      internal.linkAccount(
        social("google", idTokenWith({ email_verified: false })),
      ),
    ).rejects.toThrow(DID_NOT_ATTEST_ERROR)
    expect(store.account.map((a) => a.providerId)).toEqual(["credential"])
  })

  test("linking Facebook into the placeholder claims it: credential gone, sessions gone", async () => {
    const { internal, store } = await setup({
      user: [placeholder],
      account: [credentialRow],
      session: [sessionRow("s1")],
    })
    await internal.linkAccount(social("facebook"))
    expect(store.account.map((a) => a.providerId)).toEqual(["facebook"])
    expect(store.session).toHaveLength(0)
  })

  test("linking Facebook into an old placeholder with zero accounts claims it", async () => {
    const { internal, store } = await setup({ user: [placeholder] })
    await internal.linkAccount(social("facebook"))
    expect(store.account.map((a) => a.providerId)).toEqual(["facebook"])
    expect(store.user).toHaveLength(1)
  })

  test("linking an unknown provider into the placeholder is refused and writes nothing", async () => {
    const { internal, store } = await setup({
      user: [placeholder],
      account: [credentialRow],
      session: [sessionRow("s1")],
    })
    await expect(internal.linkAccount(social("github"))).rejects.toThrow(
      EMAIL_ATTESTING_ERROR,
    )
    expect(store.account.map((a) => a.providerId)).toEqual(["credential"])
    expect(store.session).toHaveLength(1)
  })

  test("a brand-new unverified Facebook sign-up still creates its user and account", async () => {
    const { internal, store } = await setup()
    // The hook needs the user to exist when the account is inserted;
    // createOAuthUser inserts the user first, so this proves the fresh path.
    const result = await internal.createOAuthUser(
      { email: "new@example.test", name: "new", emailVerified: false },
      { providerId: "facebook", accountId: "fb-1" },
    )
    expect(result.user.email).toBe("new@example.test")
    expect(store.user).toHaveLength(1)
    expect(store.account.map((a) => a.providerId)).toEqual(["facebook"])
  })
})
