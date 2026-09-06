import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Regression: the Redis→DB reconcile must write the *current* authoritative
// COUNT(*) for contacts/workspaces/channels and COUNT(DISTINCT userId) for
// teamMembers — not a high-water max —
// so deleting any of them frees quota slots. See reconcileUser.
//
// vi.mock factories are hoisted; per-test state flows through the shared
// `state` object, never through re-declared mocks.
// ---------------------------------------------------------------------------

const state = {
  // Markers reconcileUserSelfUsage reports back to the handler. The counts and
  // the direct-assignment upsert itself now live inside the service — see
  // packages/business/__tests__/user-quota-reconcile-self.test.ts.
  stored: null as Record<string, unknown> | null,
  // Every macUsed value the handler persisted, in order.
  persistedMac: [] as number[],
  // Truthy once reconcileUserSelfUsage ran for a user (the self-count path).
  selfReconciledUsers: [] as string[],
  hsetCalls: [] as unknown[][],
  hmgetResult: [null, null] as (string | null)[],
  // Owner MAC count returned by the (mocked) ContactActiveMonthly ledger.
  ledgerMac: 0,
}

// The handler imports a few lightweight helpers from `@chatbotx.io/business`.
// Mock them directly rather than loading the whole service+integration graph
// (which would require the full real DB schema, incompatible with the partial
// schema mock below). The helpers are pure, so re-implementing them is exact.
vi.mock("@chatbotx.io/business", () => ({
  parseLiveCount: (value: string | null) => {
    if (value === null) {
      return null
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  },
  userQuotaService: {
    invalidate: vi.fn(async () => undefined),
    reconcileOwnerPoolUsage: vi.fn(async () => undefined),
    // The authoritative self-count + direct-assignment upsert moved here from
    // the handler; the handler now only consumes the four billing markers.
    reconcileUserSelfUsage: vi.fn((userId: string) => {
      state.selfReconciledUsers.push(userId)
      return Promise.resolve({
        macUsed: (state.stored?.macUsed as number | undefined) ?? 0,
        periodStart:
          (state.stored?.periodStart as Date | null | undefined) ?? null,
        periodEnd: (state.stored?.periodEnd as Date | null | undefined) ?? null,
        monthlyBotMessagesPeriodStart:
          (state.stored?.monthlyBotMessagesPeriodStart as
            | Date
            | null
            | undefined) ?? null,
      })
    }),
    persistMacUsed: vi.fn((_userId: string, value: number) => {
      state.persistedMac.push(value)
      return Promise.resolve()
    }),
    applyMonthlyBotMessagesReset: vi.fn(async () => undefined),
  },
  // Non-reseller users: `findByOwner` returns nothing, so reconcileUser keeps
  // the per-user self-count path these tests exercise.
  tenantService: {
    findByOwner: vi.fn(async () => undefined),
    listActiveOwnerIds: vi.fn(async () => [] as string[]),
  },
}))

// liveKeyFor/USER_QUOTA_LABEL live in `@chatbotx.io/utils` (shared with
// `packages/analytics`, so the two MAC writers can never diverge on key format).
vi.mock("@chatbotx.io/utils", () => ({
  USER_QUOTA_LABEL: "user-quota",
  liveKeyFor: (label: string, id: string) => `${label}-live:${id}`,
}))

const redisClient = {
  hset: vi.fn((...args: unknown[]) => {
    state.hsetCalls.push(args)
    return Promise.resolve()
  }),
  hmget: vi.fn(async () => state.hmgetResult),
  // Default: no live keys in Redis (simulates cold start for syncUserQuota tests)
  scan: vi.fn(async () => ["0", [] as string[]]),
}

vi.mock("@chatbotx.io/redis", () => ({
  cacheConnections: { useExisting: vi.fn(async () => redisClient) },
  distributedStore: { delete: vi.fn(async () => undefined) },
}))

const countActiveContactsForOwner = vi.fn(async () => state.ledgerMac)
vi.mock("@chatbotx.io/analytics", () => ({
  macRepository: { countActiveContactsForOwner },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { reconcileUser, syncUserQuota } = await import(
  "../src/schedule/handlers/sync-user-quota"
)

// The mocked business members (factory-created vi.fns), for the owner-pool branch.
const { tenantService, userQuotaService } = (await import(
  "@chatbotx.io/business"
)) as unknown as {
  tenantService: {
    findByOwner: ReturnType<typeof vi.fn>
    listActiveOwnerIds: ReturnType<typeof vi.fn>
  }
  userQuotaService: {
    reconcileOwnerPoolUsage: ReturnType<typeof vi.fn>
    reconcileUserSelfUsage: ReturnType<typeof vi.fn>
    persistMacUsed: ReturnType<typeof vi.fn>
  }
}

describe("reconcileUser — the non-reseller path delegates the self-count", () => {
  beforeEach(() => {
    state.stored = null
    state.persistedMac = []
    state.selfReconciledUsers = []
    state.hsetCalls = []
    state.hmgetResult = [null, null]
    state.ledgerMac = 0
    redisClient.hset.mockClear()
    countActiveContactsForOwner.mockClear()
  })

  // The authoritative COUNT(*) reads, the direct-assignment (never GREATEST)
  // upsert, and the live-counter mirror all moved into
  // userQuotaService.reconcileUserSelfUsage — pinned in
  // packages/business/__tests__/user-quota-reconcile-self.test.ts. What the
  // handler still owns is *calling* it for the right user, exactly once.
  test("reconciles the user's own usage exactly once for a non-reseller", async () => {
    state.stored = {
      macUsed: 0,
      periodStart: null,
      periodEnd: null,
      monthlyBotMessagesPeriodStart: null,
    }

    await reconcileUser("user-1")

    expect(userQuotaService.reconcileUserSelfUsage).toHaveBeenCalledTimes(1)
    expect(userQuotaService.reconcileUserSelfUsage).toHaveBeenCalledWith(
      "user-1",
    )
    expect(state.selfReconciledUsers).toEqual(["user-1"])
  })
})

describe("reconcileUser — macUsed is derived from the ContactActiveMonthly ledger", () => {
  const PERIOD = "2026-06-01T00:00:00.000Z"

  beforeEach(() => {
    state.persistedMac = []
    state.selfReconciledUsers = []
    state.hsetCalls = []
    redisClient.hset.mockClear()
    countActiveContactsForOwner.mockClear()
    state.ledgerMac = 0
  })

  test("resetting plan in its current period re-grounds macUsed on the ledger count", async () => {
    // Live counter drifted low (a lost Redis increment); DB is also stale.
    state.hmgetResult = ["3", PERIOD]
    state.ledgerMac = 7
    state.stored = {
      macUsed: 5,
      periodStart: new Date(PERIOD),
      periodEnd: new Date("2026-07-01T00:00:00.000Z"),
      monthlyBotMessagesPeriodStart: null,
    }

    await reconcileUser("user-1")

    expect(countActiveContactsForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "user-1", cumulative: false }),
    )
    // The live counter is re-grounded on the ledger truth.
    expect(state.hsetCalls).toContainEqual([
      "user-quota-live:user-1",
      "mac",
      "7",
      "macPeriodStart",
      PERIOD,
    ])
    // macUsed is persisted to the ledger count (self-heals the drift).
    expect(state.persistedMac).toContain(7)
  })

  test("lifetime plan (no periodEnd) keeps the accumulate path, not the ledger", async () => {
    state.hmgetResult = ["10", PERIOD]
    state.ledgerMac = 4
    state.stored = {
      macUsed: 10,
      periodStart: new Date(PERIOD),
      periodEnd: null,
      monthlyBotMessagesPeriodStart: null,
    }

    await reconcileUser("user-1")

    expect(countActiveContactsForOwner).not.toHaveBeenCalled()
    // No mac drift to persist (live === DB within the stable lifetime period).
    expect(state.persistedMac).toHaveLength(0)
  })
})

describe("reconcileUser — reseller owner reconciles the tenant pool", () => {
  beforeEach(() => {
    state.persistedMac = []
    state.selfReconciledUsers = []
    state.hsetCalls = []
    tenantService.findByOwner.mockReset()
    tenantService.findByOwner.mockResolvedValue(undefined)
    userQuotaService.reconcileOwnerPoolUsage.mockClear()
  })

  test("an active tenant owner delegates to the pool reconcile and skips the self-count", async () => {
    tenantService.findByOwner.mockResolvedValueOnce({
      id: "tenant-1",
      ownerId: "owner-1",
      status: "active",
    })

    await reconcileUser("owner-1")

    // Pool reconcile (own + tenant aggregate) handles the owner row...
    expect(userQuotaService.reconcileOwnerPoolUsage).toHaveBeenCalledWith(
      "owner-1",
      "tenant-1",
    )
    // ...so the per-user self-count never runs for the owner.
    expect(userQuotaService.reconcileUserSelfUsage).not.toHaveBeenCalled()
    expect(state.selfReconciledUsers).toHaveLength(0)
  })

  test("a suspended tenant falls through to the per-user self-count", async () => {
    tenantService.findByOwner.mockResolvedValueOnce({
      id: "tenant-1",
      ownerId: "owner-1",
      status: "suspended",
    })
    state.stored = {
      macUsed: 0,
      periodStart: null,
      periodEnd: null,
      monthlyBotMessagesPeriodStart: null,
    }

    await reconcileUser("owner-1")

    expect(userQuotaService.reconcileOwnerPoolUsage).not.toHaveBeenCalled()
    expect(state.selfReconciledUsers).toEqual(["owner-1"])
  })
})

describe("syncUserQuota — cold reseller owners are included via DB fallback", () => {
  beforeEach(() => {
    state.persistedMac = []
    state.selfReconciledUsers = []
    state.hsetCalls = []
    redisClient.scan.mockReset()
    // Simulate empty Redis: no live keys for any user
    redisClient.scan.mockResolvedValue(["0", []])
    tenantService.findByOwner.mockReset()
    tenantService.findByOwner.mockResolvedValue(undefined)
    tenantService.listActiveOwnerIds.mockReset()
    tenantService.listActiveOwnerIds.mockResolvedValue([])
    userQuotaService.reconcileOwnerPoolUsage.mockClear()
  })

  test("a cold reseller owner (no Redis live key) is reconciled via listActiveOwnerIds", async () => {
    // Redis SCAN returns nothing — the owner has never written a live key.
    // listActiveOwnerIds finds the owner from DB instead.
    tenantService.listActiveOwnerIds.mockResolvedValue(["owner-cold"])
    tenantService.findByOwner.mockResolvedValueOnce({
      id: "tenant-cold",
      ownerId: "owner-cold",
      status: "active",
    })

    await syncUserQuota()

    expect(userQuotaService.reconcileOwnerPoolUsage).toHaveBeenCalledWith(
      "owner-cold",
      "tenant-cold",
    )
  })

  test("an owner already in Redis is not reconciled twice when also returned by listActiveOwnerIds", async () => {
    // Redis SCAN finds the owner's live key AND listActiveOwnerIds also returns them.
    redisClient.scan.mockResolvedValue(["0", ["user-quota-live:owner-warm"]])
    tenantService.listActiveOwnerIds.mockResolvedValue(["owner-warm"])
    tenantService.findByOwner.mockResolvedValueOnce({
      id: "tenant-warm",
      ownerId: "owner-warm",
      status: "active",
    })

    await syncUserQuota()

    expect(userQuotaService.reconcileOwnerPoolUsage).toHaveBeenCalledTimes(1)
    expect(userQuotaService.reconcileOwnerPoolUsage).toHaveBeenCalledWith(
      "owner-warm",
      "tenant-warm",
    )
  })

  test("returns early without DB queries when Redis and listActiveOwnerIds are both empty", async () => {
    tenantService.listActiveOwnerIds.mockResolvedValue([])

    await syncUserQuota()

    expect(userQuotaService.reconcileOwnerPoolUsage).not.toHaveBeenCalled()
    expect(state.selfReconciledUsers).toHaveLength(0)
  })
})
