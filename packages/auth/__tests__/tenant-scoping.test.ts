import { describe, expect, test, vi } from "vitest"

/**
 * Hoisted mock handles. `vi.mock` factories run before module top-level, so any
 * value a factory references must be created with `vi.hoisted`.
 */
const { findActiveByDomain, dbLimit, tenantFindFirst } = vi.hoisted(() => ({
  findActiveByDomain: vi.fn(),
  dbLimit: vi.fn(),
  tenantFindFirst: vi.fn(),
}))

// Replace the DB client with a tiny stub: a select-chain whose terminal
// `.limit()` resolves to whatever a test queues (used by resolveTenantFromOAuthState),
// plus `db.query.tenantModel.findFirst` (used by resolveTenantOwnerId). Avoids any
// real Postgres connection.
vi.mock("@chatbotx.io/database/client", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: dbLimit,
  }
  return {
    db: {
      select: () => chain,
      query: { tenantModel: { findFirst: tenantFindFirst } },
    },
    eq: () => ({}),
  }
})

// The root tenant sentinel must match the real schema value.
vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  tenantModel: {},
  verificationModel: {},
}))

// `@chatbotx.io/business` is fully stubbed so importing the auth modules never
// pulls the real service graph. Only `customDomainService.findActiveByDomain` is
// exercised (via `resolveTenantByDomain`).
vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { findActiveByDomain },
  platformCredentialService: {
    findDecryptedPlatform: vi.fn(),
    findPlatform: vi.fn(),
  },
  resolveTenantSettingsByDomain: vi.fn(),
}))

import { createTenantScopedAdapter } from "../src/server"
import {
  getTenantId,
  resolveTenantFromOAuthState,
  resolveTenantOwnerId,
  withTenant,
} from "../src/tenant-context"

const ROOT = "1"

type WhereClause = { field: string; value: unknown }
type AdapterCall = {
  model: string
  where?: WhereClause[]
  data?: Record<string, unknown>
}

describe("withTenant / getTenantId", () => {
  test("defaults to the root tenant when nothing is bound", () => {
    expect(getTenantId()).toBe(ROOT)
  })

  test("binds a tenant for the duration of the callback and restores after", async () => {
    const seen = await withTenant("42", () => {
      expect(getTenantId()).toBe("42")
      return Promise.resolve(getTenantId())
    })
    expect(seen).toBe("42")
    expect(getTenantId()).toBe(ROOT)
  })
})

describe("resolveTenantOwnerId", () => {
  test("returns null for the root tenant without hitting the DB", async () => {
    expect(await resolveTenantOwnerId(ROOT)).toBeNull()
    expect(tenantFindFirst).not.toHaveBeenCalled()
  })

  test("returns the tenant's owner id", async () => {
    tenantFindFirst.mockResolvedValueOnce({ ownerId: "200" })
    expect(await resolveTenantOwnerId("400")).toBe("200")
  })

  test("returns null when the tenant is not found", async () => {
    tenantFindFirst.mockResolvedValueOnce(undefined)
    expect(await resolveTenantOwnerId("999")).toBeNull()
  })
})

describe("resolveTenantFromOAuthState", () => {
  test("returns the root tenant without hitting the DB when state is missing", async () => {
    expect(await resolveTenantFromOAuthState(null)).toBe(ROOT)
    expect(await resolveTenantFromOAuthState(undefined)).toBe(ROOT)
    expect(await resolveTenantFromOAuthState("")).toBe(ROOT)
    expect(dbLimit).not.toHaveBeenCalled()
  })

  test("maps the stored callbackURL origin back to the tenant", async () => {
    dbLimit.mockResolvedValue([
      {
        value: JSON.stringify({ callbackURL: "https://reseller.com/welcome" }),
      },
    ])
    findActiveByDomain.mockResolvedValue({ tenantId: "42" })

    expect(await resolveTenantFromOAuthState("state-token")).toBe("42")
    expect(findActiveByDomain).toHaveBeenCalledWith("reseller.com")
  })

  test("returns the root tenant when the state row is not found", async () => {
    dbLimit.mockResolvedValue([])
    expect(await resolveTenantFromOAuthState("missing")).toBe(ROOT)
  })

  test("returns the root tenant when the stored value is not valid JSON", async () => {
    dbLimit.mockResolvedValue([{ value: "not-json" }])
    expect(await resolveTenantFromOAuthState("corrupt")).toBe(ROOT)
  })

  test("returns the root tenant when the state carries no callbackURL", async () => {
    dbLimit.mockResolvedValue([
      { value: JSON.stringify({ codeVerifier: "x" }) },
    ])
    expect(await resolveTenantFromOAuthState("no-cb")).toBe(ROOT)
  })

  test("returns the root tenant when the callbackURL host is not a known domain", async () => {
    dbLimit.mockResolvedValue([
      { value: JSON.stringify({ callbackURL: "https://platform.host/x" }) },
    ])
    findActiveByDomain.mockResolvedValue(undefined)
    expect(await resolveTenantFromOAuthState("unknown")).toBe(ROOT)
  })
})

describe("tenant-scoped adapter", () => {
  const buildScoped = () => {
    const create = vi.fn((data: AdapterCall) => Promise.resolve(data.data))
    const findOne = vi.fn()
    const findMany = vi.fn(() => Promise.resolve([]))
    const count = vi.fn(() => Promise.resolve(0))
    const baseAdapter = { create, findOne, findMany, count }
    const baseFactory = () => baseAdapter

    const scoped = createTenantScopedAdapter(
      baseFactory as unknown as Parameters<typeof createTenantScopedAdapter>[0],
    )({} as never) as unknown as {
      create: (d: AdapterCall) => Promise<unknown>
      findOne: (d: AdapterCall) => Promise<unknown>
      findMany: (d: AdapterCall) => Promise<unknown>
      count: (d: AdapterCall) => Promise<unknown>
    }

    return { scoped, create, findOne, findMany, count }
  }

  test("stamps tenantId from the bound tenant on user inserts", async () => {
    const { scoped, create } = buildScoped()

    await withTenant("42", () =>
      scoped.create({ model: "user", data: { email: "a@b.com" } }),
    )

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "user",
        data: { email: "a@b.com", tenantId: "42" },
      }),
    )
  })

  test("stamps the root tenant on user inserts outside any tenant", async () => {
    const { scoped, create } = buildScoped()

    await scoped.create({ model: "user", data: { email: "a@b.com" } })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { email: "a@b.com", tenantId: ROOT },
      }),
    )
  })

  test("does not touch inserts for non-user models", async () => {
    const { scoped, create } = buildScoped()

    await withTenant("42", () =>
      scoped.create({ model: "session", data: { token: "t" } }),
    )

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "session", data: { token: "t" } }),
    )
    const call = create.mock.calls[0]?.[0] as AdapterCall
    expect(call.data).not.toHaveProperty("tenantId")
  })

  test("scopes user lookups by email to the bound tenant", async () => {
    const { scoped, findMany, count } = buildScoped()

    await withTenant("42", async () => {
      await scoped.findMany({
        model: "user",
        where: [{ field: "email", value: "a@b.com" }],
      })
      await scoped.count({
        model: "user",
        where: [{ field: "email", value: "a@b.com" }],
      })
    })

    for (const fn of [findMany, count]) {
      const passed = fn.mock.calls[0]?.[0] as AdapterCall
      expect(passed.where).toContainEqual({ field: "tenantId", value: "42" })
    }
  })

  test("leaves non-email user lookups (by id/token) tenant-neutral", async () => {
    const { scoped, findOne } = buildScoped()
    findOne.mockResolvedValue({ id: "7" })

    await withTenant("42", () =>
      scoped.findOne({ model: "user", where: [{ field: "id", value: "7" }] }),
    )

    const passed = findOne.mock.calls[0]?.[0] as AdapterCall
    expect(passed.where).toEqual([{ field: "id", value: "7" }])
  })

  test("falls back to the tenant owner when the scoped email lookup misses", async () => {
    const { scoped, findOne } = buildScoped()
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "200" })
    tenantFindFirst.mockResolvedValueOnce({ ownerId: "200" })

    const result = await withTenant("400", () =>
      scoped.findOne({
        model: "user",
        where: [{ field: "email", value: "owner@b.com" }],
      }),
    )

    expect(result).toEqual({ id: "200" })
    const secondWhere = (findOne.mock.calls[1]?.[0] as AdapterCall).where
    expect(secondWhere).toContainEqual({ field: "id", value: "200" })
    expect(secondWhere?.some((c) => c.field === "tenantId")).toBe(false)
  })

  test("does not fall back on the root tenant (no owner)", async () => {
    const { scoped, findOne } = buildScoped()
    findOne.mockResolvedValueOnce(null)

    const result = await scoped.findOne({
      model: "user",
      where: [{ field: "email", value: "ghost@b.com" }],
    })

    expect(result).toBeNull()
    // Only the scoped lookup ran; no owner fallback for the root tenant.
    expect(findOne).toHaveBeenCalledTimes(1)
    expect(tenantFindFirst).not.toHaveBeenCalled()
  })
})
