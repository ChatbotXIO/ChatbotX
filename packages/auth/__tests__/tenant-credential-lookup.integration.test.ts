import type { BetterAuthOptions } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"
import { createInternalAdapter } from "better-auth/db"
import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  tenantModel: {},
  verificationModel: {},
}))
vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { listActiveDomains: vi.fn().mockResolvedValue([]) },
  tenantService: { findById: vi.fn() },
  platformCredentialService: {
    findDecryptedPlatform: vi.fn(),
    findPlatform: vi.fn(),
  },
  resolveTenantSettingsByDomain: vi.fn(),
}))

import { createTenantScopedAdapter } from "../src/server"
import { withTenant } from "../src/tenant-context"

const RESELLER_TENANT = "42"
const now = () => new Date()

// Credential row of a reseller sub-account, exactly as 1.7's
// `findCredentialAccount` expects it: accountId === userId.
const resellerCredential = {
  id: "acc-1",
  userId: "u1",
  providerId: "credential",
  accountId: "u1",
  password: "hash",
  tenantId: RESELLER_TENANT,
  createdAt: now(),
  updatedAt: now(),
}

const setup = () => {
  const tenantField = {
    additionalFields: {
      tenantId: { type: "string", required: false, input: false },
    },
  }
  const options = {
    advanced: { database: { generateId: false } },
    user: tenantField,
    account: tenantField,
  }
  const store = {
    user: [
      {
        id: "u1",
        email: "sub@reseller.test",
        name: "sub",
        emailVerified: true,
        tenantId: RESELLER_TENANT,
        createdAt: now(),
        updatedAt: now(),
      },
    ] as Record<string, unknown>[],
    account: [{ ...resellerCredential }] as Record<string, unknown>[],
    session: [] as Record<string, unknown>[],
    verification: [] as Record<string, unknown>[],
  }
  const scoped = createTenantScopedAdapter(memoryAdapter(store) as never)(
    options as never,
  )
  return createInternalAdapter(scoped, {
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    options: options as BetterAuthOptions,
    hooks: [],
  } as never)
}

describe("findCredentialAccount through the tenant-scoped adapter", () => {
  test("finds a reseller credential while the root tenant is bound", async () => {
    const internal = setup()

    const account = await internal.findCredentialAccount("u1")

    expect(account?.id).toBe("acc-1")
  })

  test("finds the same credential while the reseller tenant is bound", async () => {
    const internal = setup()

    const account = await withTenant(RESELLER_TENANT, () =>
      internal.findCredentialAccount("u1"),
    )

    expect(account?.id).toBe("acc-1")
  })

  test("scopes identity lookups by key to the bound tenant", async () => {
    const internal = setup()
    const key = { providerId: "credential", accountId: "u1" }

    const inRoot = await internal.findAccountByKey(key)
    const inReseller = await withTenant(RESELLER_TENANT, () =>
      internal.findAccountByKey(key),
    )

    expect(inRoot).toBeNull()
    expect(inReseller?.id).toBe("acc-1")
  })

  test("scopes the joined owner lookup by key to the bound tenant", async () => {
    const internal = setup()
    const key = { providerId: "credential", accountId: "u1" }

    const inRoot = await internal.findAccountOwnerByKey(key)
    const inReseller = await withTenant(RESELLER_TENANT, () =>
      internal.findAccountOwnerByKey(key),
    )

    expect(inRoot).toBeNull()
    expect(inReseller?.user?.id).toBe("u1")
  })
})
