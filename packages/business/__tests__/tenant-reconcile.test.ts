import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// tenantService.reconcileOwnerEntitlement is the single idempotent unit both
// the upgrade-time server action and the worker reconcile call. It must
// provision/reactivate exactly when the owner holds a white-label entitlement
// and downgrade when they don't — and be a no-op when already in the target
// state. listActiveOwnerIds must exclude the seeded root tenant (null owner).
// ---------------------------------------------------------------------------

const state = {
  hasWhiteLabel: false,
  tenant: null as { status: string } | null,
  activeTenantRows: [] as { ownerId: string | null }[],
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tenantModel: {
        findMany: vi.fn(async () => state.activeTenantRows),
      },
    },
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  sql: (strings: TemplateStringsArray) => ({ __sql: strings.join("?") }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  tenantModel: { ownerId: "tenant.ownerId" },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: (_key: string, fn: () => unknown) => fn(),
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

vi.mock("../src/user-quota/service", () => ({
  userQuotaService: {
    hasWhiteLabelEntitlement: vi.fn(async () => state.hasWhiteLabel),
  },
}))

const { tenantService } = await import("../src/enterprise/tenant/service")

describe("tenantService.reconcileOwnerEntitlement", () => {
  let provisionSpy: ReturnType<typeof vi.spyOn>
  let reactivateSpy: ReturnType<typeof vi.spyOn>
  let downgradeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    state.hasWhiteLabel = false
    state.tenant = null
    vi.spyOn(tenantService, "findByOwner").mockImplementation(
      () =>
        Promise.resolve(state.tenant) as ReturnType<
          typeof tenantService.findByOwner
        >,
    )
    provisionSpy = vi
      .spyOn(tenantService, "provisionForOwner")
      .mockResolvedValue("tenant-1")
    reactivateSpy = vi
      .spyOn(tenantService, "reactivate")
      .mockResolvedValue(undefined)
    downgradeSpy = vi
      .spyOn(tenantService, "downgrade")
      .mockResolvedValue(undefined)
  })

  test("white-label owner with no tenant → provisions one", async () => {
    state.hasWhiteLabel = true
    state.tenant = null

    await tenantService.reconcileOwnerEntitlement("owner-1")

    expect(provisionSpy).toHaveBeenCalledWith("owner-1")
    expect(reactivateSpy).not.toHaveBeenCalled()
    expect(downgradeSpy).not.toHaveBeenCalled()
  })

  test("white-label owner with a suspended tenant → reactivates it", async () => {
    state.hasWhiteLabel = true
    state.tenant = { status: "suspended" }

    await tenantService.reconcileOwnerEntitlement("owner-1")

    expect(reactivateSpy).toHaveBeenCalledWith("owner-1")
    expect(provisionSpy).not.toHaveBeenCalled()
    expect(downgradeSpy).not.toHaveBeenCalled()
  })

  test("white-label owner with an active tenant → no-op", async () => {
    state.hasWhiteLabel = true
    state.tenant = { status: "active" }

    await tenantService.reconcileOwnerEntitlement("owner-1")

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(reactivateSpy).not.toHaveBeenCalled()
    expect(downgradeSpy).not.toHaveBeenCalled()
  })

  test("non-white-label owner with an active tenant → downgrades it", async () => {
    state.hasWhiteLabel = false
    state.tenant = { status: "active" }

    await tenantService.reconcileOwnerEntitlement("owner-1")

    expect(downgradeSpy).toHaveBeenCalledWith("owner-1")
    expect(provisionSpy).not.toHaveBeenCalled()
    expect(reactivateSpy).not.toHaveBeenCalled()
  })

  test("non-white-label owner with no tenant → no-op", async () => {
    state.hasWhiteLabel = false
    state.tenant = null

    await tenantService.reconcileOwnerEntitlement("owner-1")

    expect(provisionSpy).not.toHaveBeenCalled()
    expect(reactivateSpy).not.toHaveBeenCalled()
    expect(downgradeSpy).not.toHaveBeenCalled()
  })

  test("non-white-label owner with an already-suspended tenant → no-op", async () => {
    state.hasWhiteLabel = false
    state.tenant = { status: "suspended" }

    await tenantService.reconcileOwnerEntitlement("owner-1")

    expect(downgradeSpy).not.toHaveBeenCalled()
    expect(provisionSpy).not.toHaveBeenCalled()
    expect(reactivateSpy).not.toHaveBeenCalled()
  })
})

describe("tenantService.listActiveOwnerIds", () => {
  test("returns owner ids and drops the null-owner root tenant", async () => {
    state.activeTenantRows = [
      { ownerId: "owner-1" },
      { ownerId: null },
      { ownerId: "owner-2" },
    ]

    const ownerIds = await tenantService.listActiveOwnerIds()

    expect(ownerIds).toEqual(["owner-1", "owner-2"])
  })
})
