import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstUser = vi.fn(async () => ({ tenantId: "1" }) as unknown)
const fakeTx = { __tx: true }
const dbTransaction = vi.fn(
  async (fn: (tx: unknown) => Promise<unknown>) => await fn(fakeTx),
)
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { userModel: { findFirst: findFirstUser } },
    transaction: dbTransaction,
  },
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  workspaceUsageModel: { workspaceId: "workspaceId-column" },
}))

const macTrackingService = {
  claimNewActiveContact: vi.fn(async () => ({ counted: true })),
  incrementWorkspaceMacCache: vi.fn(async () => undefined),
}
const macAnalyticsService = {
  getActiveContactCountByWorkspaceId: vi.fn(async () => 0),
}
vi.mock("@chatbotx.io/analytics", () => ({
  macAnalyticsService,
  macTrackingService,
}))

const workspaceUsageService = {
  getUsage: vi.fn(async () => ({
    contactsUsed: 0,
    channelsUsed: 0,
    teamMembersUsed: 0,
    botMessagesUsed: 0,
  })),
  increment: vi.fn(async () => undefined),
}
vi.mock("../src/workspace-usage/service", () => ({ workspaceUsageService }))

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

const zeroLiveUsage = () => ({
  workspaces: 0,
  channels: 0,
  teamMembers: 0,
  contacts: 0,
  mac: 0,
  botMessages: 0,
  monthlyBotMessages: 0,
})

// Both quota levels now live on `UserQuota`: the pool is the tenant owner's row,
// so every level routes through `userQuotaService` keyed by the relevant userId
// (owner id for the pool, sub-account id for the per-user level).
const userQuotaService = {
  tryIncrement: vi.fn(async () => true),
  hasCapacity: vi.fn(async () => true),
  consume: vi.fn(async () => undefined),
  isLimitReached: vi.fn(async () => false),
  isTeamMemberLimitReached: vi.fn(async () => false),
  countDistinctTeamMembersForOwner: vi.fn(async () => 0),
  countDistinctTeamMembersForTenant: vi.fn(async () => 0),
  getRemainingSlots: vi.fn(async () => null as number | null),
  increment: vi.fn(async () => undefined),
  incrementBy: vi.fn(async () => undefined),
  releaseBy: vi.fn(async () => undefined),
  getForUser: vi.fn(async () => null as unknown),
  getLiveUsage: vi.fn(async () => zeroLiveUsage()),
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
  // A reseller lives in the root tenant but owns a tenant; the owner's row IS
  // the pool, so `ownerId` resolves to the reseller themselves.
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
  userQuotaService.hasCapacity.mockResolvedValue(true)
  userQuotaService.tryIncrement.mockResolvedValue(true)
  userQuotaService.getRemainingSlots.mockResolvedValue(null)
  dbTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => await fn(fakeTx),
  )
  macTrackingService.claimNewActiveContact.mockResolvedValue({ counted: true })
  macTrackingService.incrementWorkspaceMacCache.mockResolvedValue(undefined)
  macAnalyticsService.getActiveContactCountByWorkspaceId.mockResolvedValue(0)
  workspaceUsageService.getUsage.mockResolvedValue({
    contactsUsed: 0,
    channelsUsed: 0,
    teamMembersUsed: 0,
    botMessagesUsed: 0,
  })
})

describe("quotaEnforcementService.tryConsume", () => {
  test("root-tenant user keeps the per-user behavior", async () => {
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
    expect(userQuotaService.consume).not.toHaveBeenCalled()
  })

  test("reseller acting directly consumes the owner pool row only", async () => {
    asReseller()

    const result = await quotaEnforcementService.tryConsume({
      userId: RESELLER,
      metric: "workspaces",
    })

    expect(result).toEqual({ ok: true })
    expect(userQuotaService.consume).toHaveBeenCalledTimes(1)
    expect(userQuotaService.consume).toHaveBeenCalledWith(
      RESELLER,
      "workspaces",
    )
  })

  test("customer consumes both their own row and the owner pool row", async () => {
    asCustomer()

    const result = await quotaEnforcementService.tryConsume({
      userId: CUSTOMER,
      metric: "workspaces",
    })

    expect(result).toEqual({ ok: true })
    expect(userQuotaService.consume).toHaveBeenCalledWith(
      RESELLER,
      "workspaces",
    )
    expect(userQuotaService.consume).toHaveBeenCalledWith(
      CUSTOMER,
      "workspaces",
    )
  })

  test("customer is blocked by the owner pool", async () => {
    asCustomer()
    // Pool = owner row (RESELLER) is full; the sub's own row has room.
    userQuotaService.hasCapacity.mockImplementation(
      async (id: string) => id !== RESELLER,
    )

    const result = await quotaEnforcementService.tryConsume({
      userId: CUSTOMER,
      metric: "workspaces",
    })

    expect(result).toEqual({ ok: false, level: "pool" })
    expect(userQuotaService.consume).not.toHaveBeenCalled()
  })

  test("customer is blocked by their own quota even when the pool has room", async () => {
    asCustomer()
    userQuotaService.hasCapacity.mockImplementation(
      async (id: string) => id !== CUSTOMER,
    )

    const result = await quotaEnforcementService.tryConsume({
      userId: CUSTOMER,
      metric: "workspaces",
    })

    expect(result).toEqual({ ok: false, level: "user" })
    expect(userQuotaService.consume).not.toHaveBeenCalled()
  })
})

describe("quotaEnforcementService.getDualRemainingSlots", () => {
  test("returns the tighter of user and pool remaining for a customer", async () => {
    asCustomer()
    userQuotaService.getRemainingSlots.mockImplementation(async (id: string) =>
      id === RESELLER ? 2 : 5,
    )

    const remaining = await quotaEnforcementService.getDualRemainingSlots({
      userId: CUSTOMER,
      metric: "contacts",
    })

    expect(remaining).toBe(2)
  })

  test("treats null (unlimited) as no constraint", async () => {
    asCustomer()
    userQuotaService.getRemainingSlots.mockImplementation(async (id: string) =>
      id === RESELLER ? 7 : null,
    )

    const remaining = await quotaEnforcementService.getDualRemainingSlots({
      userId: CUSTOMER,
      metric: "contacts",
    })

    expect(remaining).toBe(7)
  })
})

describe("quotaEnforcementService.increment", () => {
  test("increments both the sub's row and the owner pool row for a customer", async () => {
    asCustomer()

    await quotaEnforcementService.increment({
      userId: CUSTOMER,
      metric: "contacts",
    })

    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      RESELLER,
      "contacts",
      1,
    )
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      CUSTOMER,
      "contacts",
      1,
    )
  })

  test("increments only the owner pool row for a reseller", async () => {
    asReseller()

    await quotaEnforcementService.increment({
      userId: RESELLER,
      metric: "contacts",
    })

    expect(userQuotaService.incrementBy).toHaveBeenCalledTimes(1)
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      RESELLER,
      "contacts",
      1,
    )
  })
})

describe("quotaEnforcementService.release", () => {
  test("releases both the sub-account and owner pool rows", async () => {
    asCustomer()

    await quotaEnforcementService.release({
      userId: CUSTOMER,
      metric: "teamMembers",
    })

    expect(userQuotaService.releaseBy).toHaveBeenCalledWith(
      RESELLER,
      "teamMembers",
      1,
    )
    expect(userQuotaService.releaseBy).toHaveBeenCalledWith(
      CUSTOMER,
      "teamMembers",
      1,
    )
  })

  test("releases only the owner pool row for a reseller", async () => {
    asReseller()

    await quotaEnforcementService.release({
      userId: RESELLER,
      metric: "teamMembers",
    })

    expect(userQuotaService.releaseBy).toHaveBeenCalledTimes(1)
    expect(userQuotaService.releaseBy).toHaveBeenCalledWith(
      RESELLER,
      "teamMembers",
      1,
    )
  })
})

describe("quotaEnforcementService.createNewContactWithMac", () => {
  const created = {
    value: { contactId: "c-1" },
    contactId: "c-1",
    contactInboxId: "ci-1",
    inboxId: "inbox-1",
  }
  const makeCreate = () => vi.fn(async () => created)

  test("root user: gates, creates, consumes MAC, and bumps caches", async () => {
    asRootUser()
    userQuotaService.getRemainingSlots.mockResolvedValue(5)
    userQuotaService.getForUser.mockResolvedValue({
      periodStart: new Date("2026-06-01T00:00:00Z"),
    })
    const create = makeCreate()

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create,
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(create).toHaveBeenCalledTimes(1)
    expect(macTrackingService.claimNewActiveContact).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "c-1",
        contactInboxId: "ci-1",
        inboxId: "inbox-1",
      }),
      fakeTx,
    )
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      ROOT_USER,
      "mac",
      1,
    )
    expect(macTrackingService.incrementWorkspaceMacCache).toHaveBeenCalledWith(
      "ws-1",
      1,
    )
    // The info-only `contacts` counter is recorded by the chokepoint itself.
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      ROOT_USER,
      "contacts",
      1,
    )
  })

  test("rejects and creates nothing when MAC is exhausted", async () => {
    asRootUser()
    userQuotaService.getRemainingSlots.mockResolvedValue(0)
    const create = makeCreate()

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create,
    })

    expect(result).toEqual({ ok: false, level: "user" })
    expect(create).not.toHaveBeenCalled()
    expect(macTrackingService.claimNewActiveContact).not.toHaveBeenCalled()
    expect(userQuotaService.incrementBy).not.toHaveBeenCalled()
  })

  test("period-less owner with a finite MAC limit still consumes live quota", async () => {
    asRootUser()
    userQuotaService.getRemainingSlots.mockResolvedValue(5)
    userQuotaService.getForUser.mockResolvedValue({ periodStart: null })
    const create = makeCreate()

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create,
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(create).toHaveBeenCalledTimes(1)
    expect(macTrackingService.claimNewActiveContact).not.toHaveBeenCalled()
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      ROOT_USER,
      "mac",
      1,
    )
    expect(macTrackingService.incrementWorkspaceMacCache).not.toHaveBeenCalled()
  })

  test("period-less owner without a MAC limit records contacts but no MAC noise", async () => {
    asRootUser()
    userQuotaService.getRemainingSlots.mockResolvedValue(null)
    userQuotaService.getForUser.mockResolvedValue({ periodStart: null })
    const create = makeCreate()

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create,
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(create).toHaveBeenCalledTimes(1)
    expect(macTrackingService.claimNewActiveContact).not.toHaveBeenCalled()
    expect(macTrackingService.incrementWorkspaceMacCache).not.toHaveBeenCalled()
    // No MAC consumption (no limit, no period)...
    expect(userQuotaService.incrementBy).not.toHaveBeenCalledWith(
      ROOT_USER,
      "mac",
      1,
    )
    // ...but the info-only `contacts` total is still recorded for the new contact.
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      ROOT_USER,
      "contacts",
      1,
    )
  })

  test("customer: consumes MAC at both the owner pool and their own row", async () => {
    asCustomer()
    userQuotaService.getRemainingSlots.mockResolvedValue(5)
    userQuotaService.getForUser.mockResolvedValue({
      periodStart: new Date("2026-06-01T00:00:00Z"),
    })

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      RESELLER,
      "mac",
      1,
    )
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      CUSTOMER,
      "mac",
      1,
    )
  })
})

describe("quotaEnforcementService.createContactWithoutMac", () => {
  test("root user: runs the callback in a transaction and bumps only contacts", async () => {
    asRootUser()
    const create = vi.fn(async () => ({ contactId: "c-1" }))

    const value = await quotaEnforcementService.createContactWithoutMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create,
    })

    expect(value).toEqual({ contactId: "c-1" })
    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(fakeTx)
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      ROOT_USER,
      "contacts",
      1,
    )
    expect(workspaceUsageService.increment).toHaveBeenCalledWith(
      "ws-1",
      "contacts",
    )
    // Never gates, locks, or touches MAC.
    expect(distributedLock.runExclusive).not.toHaveBeenCalled()
    expect(macTrackingService.claimNewActiveContact).not.toHaveBeenCalled()
    expect(userQuotaService.incrementBy).not.toHaveBeenCalledWith(
      ROOT_USER,
      "mac",
      1,
    )
  })

  test("customer: bumps both the sub's row and the owner pool row", async () => {
    asCustomer()
    const create = vi.fn(async () => ({ contactId: "c-1" }))

    await quotaEnforcementService.createContactWithoutMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create,
    })

    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      RESELLER,
      "contacts",
      1,
    )
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      CUSTOMER,
      "contacts",
      1,
    )
  })

  test("never rejects — there is no MAC/contacts gate to fail", async () => {
    asRootUser()
    userQuotaService.getRemainingSlots.mockResolvedValue(0)
    const create = vi.fn(async () => ({ contactId: "c-1" }))

    const value = await quotaEnforcementService.createContactWithoutMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create,
    })

    expect(value).toEqual({ contactId: "c-1" })
    expect(create).toHaveBeenCalledTimes(1)
  })

  test("workspace usage increment failure does not affect the returned value", async () => {
    asRootUser()
    workspaceUsageService.increment.mockRejectedValueOnce(new Error("boom"))
    const create = vi.fn(async () => ({ contactId: "c-1" }))

    const value = await quotaEnforcementService.createContactWithoutMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create,
    })

    expect(value).toEqual({ contactId: "c-1" })
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      ROOT_USER,
      "contacts",
      1,
    )
  })
})

describe("quotaEnforcementService.getUsageSummary", () => {
  test("root-tenant user reports live used against their UserQuota limit", async () => {
    asRootUser()
    // limit from the (slow) quota row, used from the live counter — the live
    // value (3) is shown, not the stale row's used (which is ignored).
    userQuotaService.metricValues.mockReturnValue({ limit: 10, used: 99 })
    userQuotaService.getLiveUsage.mockResolvedValue({
      ...zeroLiveUsage(),
      workspaces: 3,
    })

    const summary = await quotaEnforcementService.getUsageSummary(ROOT_USER)

    expect(summary.workspaces).toEqual({ used: 3, limit: 10 })
    expect(summary.teamMembers).toEqual({ used: 0, limit: 10 })
    expect(userQuotaService.getLiveUsage).toHaveBeenCalledWith(ROOT_USER)
    expect(
      userQuotaService.countDistinctTeamMembersForOwner,
    ).toHaveBeenCalledWith(ROOT_USER)
  })

  test("reseller reports the live pooled usage against their plan limit", async () => {
    asReseller()
    // Pool used + limit BOTH come from the owner's `UserQuota` row, so they
    // cannot disagree (the fix for the DB/cache split-brain).
    userQuotaService.getLiveUsage.mockResolvedValue({
      ...zeroLiveUsage(),
      workspaces: 8,
    })
    userQuotaService.metricValues.mockReturnValue({ limit: 10, used: 8 })

    const summary = await quotaEnforcementService.getUsageSummary(RESELLER)

    expect(summary.workspaces).toEqual({ used: 8, limit: 10 })
    expect(summary.teamMembers).toEqual({ used: 0, limit: 10 })
    expect(userQuotaService.getLiveUsage).toHaveBeenCalledWith(RESELLER)
    expect(userQuotaService.getForUser).toHaveBeenCalledWith(RESELLER)
    expect(
      userQuotaService.countDistinctTeamMembersForTenant,
    ).toHaveBeenCalledWith(TENANT)
  })

  test("sub-account reports its own live allocation, not the pool", async () => {
    asCustomer()
    userQuotaService.metricValues.mockReturnValue({ limit: 5, used: 99 })
    userQuotaService.getLiveUsage.mockResolvedValue({
      ...zeroLiveUsage(),
      workspaces: 2,
    })

    const summary = await quotaEnforcementService.getUsageSummary(CUSTOMER)

    expect(summary.workspaces).toEqual({ used: 2, limit: 5 })
    expect(userQuotaService.getLiveUsage).toHaveBeenCalledWith(CUSTOMER)
  })
})

describe("quotaEnforcementService.getWorkspaceUsageSummary", () => {
  test("reuses the workspace lifetime bot-message count for the monthly metric", async () => {
    asRootUser()
    userQuotaService.metricValues.mockReturnValue({ limit: 100, used: 0 })
    userQuotaService.getLiveUsage.mockResolvedValue({
      ...zeroLiveUsage(),
      botMessages: 25,
      monthlyBotMessages: 10,
    })
    workspaceUsageService.getUsage.mockResolvedValue({
      contactsUsed: 1,
      channelsUsed: 2,
      teamMembersUsed: 3,
      botMessagesUsed: 7,
    })

    const summary = await quotaEnforcementService.getWorkspaceUsageSummary({
      userId: ROOT_USER,
      workspaceId: "ws-1",
    })

    expect(summary.monthlyBotMessages).toEqual({
      used: 10,
      limit: 100,
      workspaceUsed: 7,
    })
  })
})

describe("quotaEnforcementService.hasReachedLimit", () => {
  test("reads the current owner-scoped distinct count for team members", async () => {
    asRootUser()
    userQuotaService.isTeamMemberLimitReached.mockResolvedValue(true)

    await expect(
      quotaEnforcementService.hasReachedLimit({
        userId: ROOT_USER,
        metric: "teamMembers",
      }),
    ).resolves.toBe(true)

    expect(userQuotaService.isTeamMemberLimitReached).toHaveBeenCalledWith(
      { ownerId: ROOT_USER },
      ROOT_USER,
    )
    expect(userQuotaService.isLimitReached).not.toHaveBeenCalled()
  })

  test("keeps non-team-member metrics on the live-counter path", async () => {
    asRootUser()

    await quotaEnforcementService.hasReachedLimit({
      userId: ROOT_USER,
      metric: "workspaces",
    })

    expect(userQuotaService.isLimitReached).toHaveBeenCalledWith(
      ROOT_USER,
      "workspaces",
    )
    expect(userQuotaService.isTeamMemberLimitReached).not.toHaveBeenCalled()
  })

  test("checks both the sub-account owner scope and reseller tenant pool", async () => {
    asCustomer()
    userQuotaService.isTeamMemberLimitReached.mockImplementation(
      async (_scope: unknown, limitUserId: string) => limitUserId === RESELLER,
    )

    await expect(
      quotaEnforcementService.hasReachedLimit({
        userId: CUSTOMER,
        metric: "teamMembers",
      }),
    ).resolves.toBe(true)

    expect(userQuotaService.isTeamMemberLimitReached).toHaveBeenNthCalledWith(
      1,
      { ownerId: CUSTOMER },
      CUSTOMER,
    )
    expect(userQuotaService.isTeamMemberLimitReached).toHaveBeenNthCalledWith(
      2,
      { tenantId: TENANT },
      RESELLER,
    )
  })
})

describe("quotaEnforcementService.getAtLimitMap", () => {
  test("includes both lifetime and monthly bot message metrics", async () => {
    asRootUser()

    const limits = await quotaEnforcementService.getAtLimitMap(ROOT_USER)

    expect(limits).toHaveProperty("botMessages", false)
    expect(limits).toHaveProperty("monthlyBotMessages", false)
  })
})
