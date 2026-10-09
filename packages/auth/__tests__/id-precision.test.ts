import type { BetterAuthOptions } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"
import { describe, expect, test, vi } from "vitest"

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

const ODD_ID = "11728999944477963" // > 2^53 and odd: not representable as a double
const EVEN_NEIGHBOUR = "11728999944477964"
const PG_BIGINT_MAX = 9_223_372_036_854_775_807n
const NUMERIC_ID = /^\d{10,19}$/
const now = () => new Date()

/** The `advanced.database` block the real config hands to better-auth. */
const databaseOptionsFromCreateAuth = async () => {
  const { createAuth } = await import("../src/server")
  createAuth({})
  const config = betterAuthMock.mock.calls.at(-1)?.[0] as BetterAuthOptions
  return config.advanced?.database as {
    generateId: (o: { model: string }) => string
  }
}

/** Memory adapter driven by that block; `seed` prepopulates the backing store. */
const adapterWith = async (seed: { user?: Record<string, unknown>[] } = {}) => {
  const database = await databaseOptionsFromCreateAuth()
  const store = {
    user: seed.user ?? [],
    account: [],
    session: [],
    verification: [],
  }
  return {
    adapter: memoryAdapter(store)({ advanced: { database } } as never),
    store,
  }
}

const oddUser = {
  id: ODD_ID,
  email: "odd@example.test",
  name: "odd",
  emailVerified: true,
  createdAt: now(),
  updatedAt: now(),
}
const evenUser = {
  ...oddUser,
  id: EVEN_NEIGHBOUR,
  email: "even@example.test",
  name: "even",
}

describe("64-bit ids through better-auth's adapter factory", () => {
  test("a where-clause on an odd id finds that user, not the even neighbour", async () => {
    const { adapter } = await adapterWith({ user: [oddUser, evenUser] })
    const found = await adapter.findOne<{ id: string }>({
      model: "user",
      where: [{ field: "id", value: ODD_ID }],
    })
    expect(found?.id).toBe(ODD_ID)
  })

  test("Account.userId and Session.userId are stored exactly", async () => {
    const { adapter } = await adapterWith({ user: [oddUser] })
    const account = await adapter.create<{ userId: string }>({
      model: "account",
      data: {
        userId: ODD_ID,
        providerId: "google",
        accountId: "sub",
        createdAt: now(),
        updatedAt: now(),
      },
    })
    const session = await adapter.create<{ userId: string }>({
      model: "session",
      data: {
        userId: ODD_ID,
        token: "tok",
        expiresAt: now(),
        createdAt: now(),
        updatedAt: now(),
      },
    })
    expect(account.userId).toBe(ODD_ID)
    expect(session.userId).toBe(ODD_ID)
  })

  test("update and delete predicates on an odd user id hit the right row", async () => {
    const { adapter, store } = await adapterWith({ user: [oddUser, evenUser] })
    await adapter.update({
      model: "user",
      where: [{ field: "id", value: ODD_ID }],
      update: { name: "renamed" },
    })
    expect(store.user.find((u) => u.id === ODD_ID)?.name).toBe("renamed")
    expect(store.user.find((u) => u.id === EVEN_NEIGHBOUR)?.name).toBe("even")
    await adapter.delete({
      model: "user",
      where: [{ field: "id", value: ODD_ID }],
    })
    expect(store.user.map((u) => u.id)).toEqual([EVEN_NEIGHBOUR])
  })

  test.each([
    "user",
    "account",
    "session",
    "verification",
  ] as const)("generated %s ids are unique numeric strings inside signed bigint range", async (model) => {
    const { adapter } = await adapterWith({ user: [oddUser] })
    const base: Record<string, Record<string, unknown>> = {
      user: { email: "g@example.test", name: "g", emailVerified: false },
      account: { userId: ODD_ID, providerId: "google", accountId: "s" },
      session: { userId: ODD_ID, token: "t", expiresAt: now() },
      verification: { identifier: "i", value: "v", expiresAt: now() },
    }
    const ids = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const row = await adapter.create<{ id: string }>({
        model,
        data: {
          ...base[model],
          createdAt: now(),
          updatedAt: now(),
          ...(model === "user" ? { email: `g${i}@example.test` } : {}),
        },
      })
      expect(row.id).toMatch(NUMERIC_ID)
      expect(BigInt(row.id) <= PG_BIGINT_MAX).toBe(true)
      ids.add(row.id)
    }
    expect(ids.size).toBe(5)
  })

  test("the tenant-scoped wrapper keeps an explicit odd id and stamps tenantId", async () => {
    const { createTenantScopedAdapter } = await import("../src/server")
    const database = await databaseOptionsFromCreateAuth()
    const store = { user: [], account: [], session: [], verification: [] }
    const adapter = createTenantScopedAdapter(memoryAdapter(store))({
      advanced: { database },
      user: {
        additionalFields: { tenantId: { type: "string", required: false } },
      },
    } as never)
    const user = await adapter.create<{ id: string; tenantId: string }>({
      model: "user",
      data: { ...oddUser },
      forceAllowId: true,
    })
    expect(user.id).toBe(ODD_ID)
    expect(user.tenantId).toBe("1")
  })
})

describe("createAuth database options", () => {
  test("hands better-auth a function generateId that returns a snowflake string, never 'serial'", async () => {
    const database = await databaseOptionsFromCreateAuth()
    expect(typeof database.generateId).toBe("function")
    const id = database.generateId({ model: "user" })
    expect(id).toMatch(NUMERIC_ID)
    expect(BigInt(id) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true)
  })

  test("a tenant-flavoured createAuth call shares the same database options", async () => {
    const { createAuth, AUTH_DATABASE_OPTIONS } = await import("../src/server")
    createAuth({ onUserCreated: async () => undefined })
    const config = betterAuthMock.mock.calls.at(-1)?.[0] as BetterAuthOptions
    expect(config.advanced?.database).toBe(AUTH_DATABASE_OPTIONS)
  })
})
