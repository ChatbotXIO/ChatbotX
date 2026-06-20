import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstUser = vi.fn(async () => ({ tenantId: "1" }) as unknown)
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { userModel: { findFirst: findFirstUser } } },
}))
vi.mock("@chatbotx.io/database/schema", () => ({ ROOT_TENANT_ID: "1" }))

// distributedLock just runs the critical section inline for the test.
const distributedLock = {
  runExclusive: vi.fn(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  ),
}
vi.mock("@chatbotx.io/redis", () => ({ distributedLock }))

const tenantService = {
  findByOwner: vi.fn(async () => undefined as unknown),
  findById: vi.fn(async () => undefined as unknown),
}
vi.mock("../src/enterprise/tenant/service", () => ({ tenantService }))

const tenantQuotaService = {
  hasCapacity: vi.fn(async () => true),
  consume: vi.fn(async () => undefined),
  isLimitReached: vi.fn(async () => false),
  getRemainingSlots: vi.fn(async () => null as number | null),
  increment: vi.fn(async () => undefined),
  incrementBy: vi.fn(async () => undefined),
  getUsage: vi.fn(async () => null as unknown),
  metricUsed: vi.fn(() => 0),
}
vi.mock("../src/tenant-quota/service", () => ({ tenantQuotaService }))

const userQuotaService = {
  tryIncrement: vi.fn(async () => true),
  hasCapacity: vi.fn(async () => true),
  consume: vi.fn(async () => undefined),
  isLimitReached: vi.fn(async () => false),
  getRemainingSlots: vi.fn(async () => null as number | null),
  increment: vi.fn(async () => undefined),
  incrementBy: vi.fn(async () => undefined),
  getForUser: vi.fn(async () => null as unknown),
  metricValues: vi.fn(() => ({ limit: null as number | null, used: 0 })),
}
vi.mock("../src/user-quota/service", () => ({ userQuotaService }))

const { quotaEnforcementService } = await import(
  "../src/quota-enforcement/service"
)

const ROOT_USER = "root-user"
const RESELLER = "reseller-1"
const CUSTOMER = "customer-1"
const TENANT = "tenant-1"

const asRootUser = () => {
  findFirstUser.mockResolvedValue({ tenantId: "1" })
  tenantService.findByOwner.mockResolvedValue(undefined)
}

const asReseller = () => {
  // A reseller lives in the root tenant but owns a tenant.
  findFirstUser.mockResolvedValue({ tenantId: "1" })
  tenantService.findByOwner.mockResolvedValue({ id: TENANT })
  tenantService.findById.mockResolvedValue({
    ownerId: RESELLER,
    status: "active",
  })
}

const asCustomer = () => {
  findFirstUser.mockResolvedValue({ tenantId: TENANT })
  tenantService.findById.mockResolvedValue({
    ownerId: RESELLER,
    status: "active",
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantQuotaService.hasCapacity.mockResolvedValue(true)
  userQuotaService.hasCapacity.mockResolvedValue(true)
  userQuotaService.tryIncrement.mockResolvedValue(true)
})

describe("quotaEnforcementService.tryConsume", () => {
  test("root-tenant user keeps the legacy per-user behavior", async () => {
    asRootUser()

    const result = await quotaEnforcementService.tryConsume({
      userId: ROOT_USER,
      metric: "workspaces",
    })

    expect(result).toEqual({ ok: true })
    expect(userQuotaService.tryIncrement).toHaveBeenCalledWith(
      ROOT_USER,
      "workspaces",
    )
    expect(tenantQuotaService.consume).not.toHaveBeenCalled()
  })

  test("reseller acting directly consumes the pool only", async () => {
    asReseller()

    const result = await quotaEnforcementService.tryConsume({
      userId: RESELLER,
      metric: "workspaces",
    })

    expect(result).toEqual({ ok: true })
    expect(tenantQuotaService.consume).toHaveBeenCalledWith(
      TENANT,
      "workspaces",
    )
    expect(userQuotaService.consume).not.toHaveBeenCalled()
  })

  test("customer consumes both their own quota and the pool", async () => {
    asCustomer()

    const result = await quotaEnforcementService.tryConsume({
      userId: CUSTOMER,
      metric: "workspaces",
    })

    expect(result).toEqual({ ok: true })
    expect(tenantQuotaService.consume).toHaveBeenCalledWith(
      TENANT,
      "workspaces",
    )
    expect(userQuotaService.consume).toHaveBeenCalledWith(
      CUSTOMER,
      "workspaces",
    )
  })

  test("customer is blocked by the reseller pool", async () => {
    asCustomer()
    tenantQuotaService.hasCapacity.mockResolvedValue(false)

    const result = await quotaEnforcementService.tryConsume({
      userId: CUSTOMER,
      metric: "workspaces",
    })

    expect(result).toEqual({ ok: false, level: "pool" })
    expect(tenantQuotaService.consume).not.toHaveBeenCalled()
    expect(userQuotaService.consume).not.toHaveBeenCalled()
  })

  test("customer is blocked by their own quota even when the pool has room", async () => {
    asCustomer()
    userQuotaService.hasCapacity.mockResolvedValue(false)

    const result = await quotaEnforcementService.tryConsume({
      userId: CUSTOMER,
      metric: "workspaces",
    })

    expect(result).toEqual({ ok: false, level: "user" })
    expect(tenantQuotaService.consume).not.toHaveBeenCalled()
    expect(userQuotaService.consume).not.toHaveBeenCalled()
  })
})

describe("quotaEnforcementService.getDualRemainingSlots", () => {
  test("returns the tighter of user and pool remaining for a customer", async () => {
    asCustomer()
    userQuotaService.getRemainingSlots.mockResolvedValue(5)
    tenantQuotaService.getRemainingSlots.mockResolvedValue(2)

    const remaining = await quotaEnforcementService.getDualRemainingSlots({
      userId: CUSTOMER,
      metric: "contacts",
    })

    expect(remaining).toBe(2)
  })

  test("treats null (unlimited) as no constraint", async () => {
    asCustomer()
    userQuotaService.getRemainingSlots.mockResolvedValue(null)
    tenantQuotaService.getRemainingSlots.mockResolvedValue(7)

    const remaining = await quotaEnforcementService.getDualRemainingSlots({
      userId: CUSTOMER,
      metric: "contacts",
    })

    expect(remaining).toBe(7)
  })
})

describe("quotaEnforcementService.increment", () => {
  test("increments both levels for a customer", async () => {
    asCustomer()

    await quotaEnforcementService.increment({
      userId: CUSTOMER,
      metric: "contacts",
    })

    expect(tenantQuotaService.incrementBy).toHaveBeenCalledWith(
      TENANT,
      "contacts",
      1,
    )
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      CUSTOMER,
      "contacts",
      1,
    )
  })

  test("increments only the pool for a reseller", async () => {
    asReseller()

    await quotaEnforcementService.increment({
      userId: RESELLER,
      metric: "contacts",
    })

    expect(tenantQuotaService.incrementBy).toHaveBeenCalledWith(
      TENANT,
      "contacts",
      1,
    )
    expect(userQuotaService.incrementBy).not.toHaveBeenCalled()
  })
})

describe("quotaEnforcementService.getUsageSummary", () => {
  test("root-tenant user reports their own UserQuota values", async () => {
    asRootUser()
    userQuotaService.metricValues.mockReturnValue({ limit: 10, used: 3 })

    const summary = await quotaEnforcementService.getUsageSummary(ROOT_USER)

    expect(summary.workspaces).toEqual({ used: 3, limit: 10 })
    expect(tenantQuotaService.metricUsed).not.toHaveBeenCalled()
  })

  test("reseller reports the pooled usage against their plan limit", async () => {
    asReseller()
    tenantQuotaService.metricUsed.mockReturnValue(8)
    userQuotaService.metricValues.mockReturnValue({ limit: 10, used: 1 })

    const summary = await quotaEnforcementService.getUsageSummary(RESELLER)

    // Pool aggregate used (8), reseller plan limit (10) — not their personal 1.
    expect(summary.workspaces).toEqual({ used: 8, limit: 10 })
    expect(tenantQuotaService.getUsage).toHaveBeenCalledWith(TENANT)
    expect(userQuotaService.getForUser).toHaveBeenCalledWith(RESELLER)
  })

  test("sub-account reports its own allocation, not the pool", async () => {
    asCustomer()
    userQuotaService.metricValues.mockReturnValue({ limit: 5, used: 2 })

    const summary = await quotaEnforcementService.getUsageSummary(CUSTOMER)

    expect(summary.workspaces).toEqual({ used: 2, limit: 5 })
    expect(tenantQuotaService.metricUsed).not.toHaveBeenCalled()
  })
})
