import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// tenantService's cache contract:
//   - findByOwner wraps its row in `{ tenant }` so the common "no tenant"
//     result is cacheable too (withCache skips bare null/undefined), and
//     unwraps it back to `tenant ?? undefined` for callers.
//   - The positive result is tagged with the tenant's own tag via
//     `dynamicTags`, so a tenant-id write (upsertById/upsertByOwner/
//     setStatusByOwner) busts the owner-keyed cache entry without needing a
//     second explicit tag.
//   - provisionForOwner is the one write that turns a negative into a
//     positive — it must invalidate the owner tag directly, since no tenant
//     tag exists yet at that point.
// ---------------------------------------------------------------------------

const findFirst = vi.fn()
const insertReturning = vi.fn()
const updateReturning = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { tenantModel: { findFirst } },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: insertReturning,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: updateReturning,
        })),
      })),
    })),
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
}))

// Plain object stub — never importOriginal @chatbotx.io/database/schema (it
// can open a real connection through the sharding client). Only `tenantModel`
// is needed: `userQuotaService` and `workspaceLifecycleService` (pulled in by
// tenant/service.ts) are mocked below instead of loaded for real, so their
// own schema model imports never execute.
vi.mock("@chatbotx.io/database/schema", () => ({
  tenantModel: { id: "tenant.id", ownerId: "tenant.ownerId" },
}))

vi.mock("../src/user-quota/service", () => ({
  userQuotaService: {
    hasWhiteLabelEntitlement: vi.fn(async () => false),
    clearWhiteLabelEntitlements: vi.fn(async () => undefined),
  },
}))

vi.mock("../src/workspace-lifecycle/service", () => ({
  workspaceLifecycleService: {
    deactivateOwnerWorkspaces: vi.fn(async () => undefined),
  },
}))

const withCache = vi.fn()
const invalidateCacheByTags = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/redis", () => ({
  withCache,
  invalidateCacheByTags,
}))

// Dynamic import: the module under test must load after the vi.mock calls
// above are hoisted and applied, so a static top-level import (which would
// resolve before the mocks exist) cannot work here.
const { tenantService } = await import("../src/enterprise/tenant/service")

describe("tenantService cache contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withCache.mockImplementation((_key: string, fn: () => unknown) => fn())
  })

  test("findByOwner caches the negative result and returns undefined", async () => {
    findFirst.mockResolvedValueOnce(undefined)

    const result = await tenantService.findByOwner("owner-1")

    expect(result).toBeUndefined()
    expect(withCache).toHaveBeenCalledWith(
      "tenants:owner:owner-1",
      expect.any(Function),
      expect.objectContaining({ tags: ["tenants:owner:owner-1"] }),
    )
  })

  test("findByOwner's positive result is tagged with the tenant's own tag", async () => {
    findFirst.mockResolvedValueOnce({ id: "tenant-1", ownerId: "owner-1" })

    const result = await tenantService.findByOwner("owner-1")

    expect(result).toEqual({ id: "tenant-1", ownerId: "owner-1" })
    const options = withCache.mock.calls[0]?.[2] as {
      dynamicTags: (r: { tenant: { id: string } | null }) => unknown
    }
    expect(options.dynamicTags({ tenant: { id: "tenant-1" } })).toEqual([
      "tenants:tenant-1",
    ])
    expect(options.dynamicTags({ tenant: null })).toBeUndefined()
  })

  test("provisionForOwner invalidates the owner tag after inserting a new tenant", async () => {
    findFirst.mockResolvedValueOnce(undefined) // no existing tenant
    insertReturning.mockResolvedValueOnce([{ id: "tenant-1" }])

    const id = await tenantService.provisionForOwner("owner-1")

    expect(id).toBe("tenant-1")
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "tenants:owner:owner-1",
    ])
  })

  test("provisionForOwner is a no-op (no invalidation) when a tenant already exists", async () => {
    findFirst.mockResolvedValueOnce({ id: "tenant-1" })

    const id = await tenantService.provisionForOwner("owner-1")

    expect(id).toBe("tenant-1")
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test.each([
    [
      "upsertByOwner",
      () => tenantService.upsertByOwner("owner-1", { brandName: "Acme" }),
    ],
    [
      "upsertById",
      () => tenantService.upsertById("tenant-1", { brandName: "Acme" }),
    ],
    [
      "setStatusByOwner",
      () => tenantService.setStatusByOwner("owner-1", "suspended"),
    ],
  ] as const)("%s invalidates the tenant tag", async (_name, run) => {
    updateReturning.mockResolvedValueOnce([{ id: "tenant-1" }])

    await run()

    expect(invalidateCacheByTags).toHaveBeenCalledWith(["tenants:tenant-1"])
  })
})
