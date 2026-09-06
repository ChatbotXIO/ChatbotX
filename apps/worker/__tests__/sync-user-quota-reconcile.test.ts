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
  // Existence filter: `null` means every id in the batch exists; a Set restricts
  // which ids the User table "contains" (the rest are treated as deleted ghosts).
  existingUserIds: null as Set<string> | null,
  // When set, reconcileUserSelfUsage/reconcileOwnerPoolUsage reject with this
  // error, to exercise both the FK race (user deleted mid-run) and unrelated
  // failures.
  insertRejectError: null as Error | null,
}

// The handler still consults `isForeignKeyViolationError` directly to decide
// whether a reconcile failure is a benign ghost-user race.
vi.mock("@chatbotx.io/database/client", () => ({
  isForeignKeyViolationError: vi.fn(
    (error: unknown, constraint: string) =>
      error instanceof Error && error.message === constraint,
  ),
}))

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
    reconcileOwnerPoolUsage: vi.fn((_userId: string, _tenantId: string) => {
      if (state.insertRejectError) {
        return Promise.reject(state.insertRejectError)
      }
      return Promise.resolve(undefined)
    }),
    clearLiveCounters: vi.fn(async () => undefined),
    // The authoritative self-count + direct-assignment upsert moved here from
    // the handler; the handler now only consumes the four billing markers.
    reconcileUserSelfUsage: vi.fn((userId: string) => {
      if (state.insertRejectError) {
        return Promise.reject(state.insertRejectError)
      }
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
  // The ghost-id existence filter lives on the service, not a raw `db.select`
  // in the handler. `existingUserIds === null` means every id in the batch
  // still has a User row.
  userService: {
    listExistingIds: vi.fn(async ({ ids }: { ids: string[] }) =>
      ids.filter(
        (id) => state.existingUserIds === null || state.existingUserIds.has(id),
      ),
    ),
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
    clearLiveCounters: ReturnType<typeof vi.fn>
  }
}

const { logger } = (await import("../src/lib/logger")) as unknown as {
  logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }
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

// ---------------------------------------------------------------------------
// Regression: a live-counter key can outlive the user it belonged to (User
// delete cascades UserQuota but not the Redis key). The sync must skip such
// ghost ids and clean their stale keys, and tolerate a user deleted mid-run,
// instead of violating UserQuota → User on every cron.
// ---------------------------------------------------------------------------
describe("syncUserQuota — skips and cleans up deleted (ghost) users", () => {
  beforeEach(() => {
    state.stored = {
      macUsed: 0,
      periodStart: null,
      periodEnd: null,
      monthlyBotMessagesPeriodStart: null,
    }
    state.persistedMac = []
    state.selfReconciledUsers = []
    state.hsetCalls = []
    state.existingUserIds = null
    state.insertRejectError = null
    redisClient.scan.mockReset()
    redisClient.scan.mockResolvedValue(["0", []])
    tenantService.findByOwner.mockReset()
    tenantService.findByOwner.mockResolvedValue(undefined)
    tenantService.listActiveOwnerIds.mockReset()
    tenantService.listActiveOwnerIds.mockResolvedValue([])
    userQuotaService.clearLiveCounters.mockClear()
  })

  test("a live key for a deleted user is cleaned up and never reconciled", async () => {
    redisClient.scan.mockResolvedValue([
      "0",
      ["user-quota-live:ghost-1", "user-quota-live:real-1"],
    ])
    // The User table only still has `real-1`.
    state.existingUserIds = new Set(["real-1"])

    await syncUserQuota()

    // The ghost's stale live key is cleared and it never reaches reconcile.
    expect(userQuotaService.clearLiveCounters).toHaveBeenCalledWith("ghost-1")
    expect(userQuotaService.clearLiveCounters).not.toHaveBeenCalledWith(
      "real-1",
    )
    // The surviving user is still reconciled (its self-count ran once).
    expect(state.selfReconciledUsers).toEqual(["real-1"])
  })
})

describe("reconcileUser — a user deleted mid-run is skipped, not error-logged", () => {
  beforeEach(() => {
    state.stored = null
    state.persistedMac = []
    state.selfReconciledUsers = []
    state.hsetCalls = []
    state.insertRejectError = null
    tenantService.findByOwner.mockReset()
    tenantService.findByOwner.mockResolvedValue(undefined)
    userQuotaService.clearLiveCounters.mockClear()
    userQuotaService.reconcileOwnerPoolUsage.mockClear()
    logger.info.mockClear()
    logger.error.mockClear()
  })

  test("a foreign-key violation on the per-user upsert clears the stale key without throwing", async () => {
    // The user vanished before the upsert committed.
    state.insertRejectError = new Error("UserQuota_userId_User_id_fkey")

    await expect(reconcileUser("ghost-2")).resolves.toBeUndefined()

    expect(userQuotaService.clearLiveCounters).toHaveBeenCalledWith("ghost-2")
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "ghost-2" },
      "user-quota: skipped reconcile for a user that no longer exists",
    )
  })

  test("a foreign-key violation on the owner-pool upsert is skipped the same way", async () => {
    // The owner branch (reconcileOwnerPoolUsage) throws the same FK — the shared
    // catch must clear and skip it too, not just the per-user path.
    tenantService.findByOwner.mockResolvedValueOnce({
      id: "tenant-x",
      ownerId: "owner-ghost",
      status: "active",
    })
    state.insertRejectError = new Error("UserQuota_userId_User_id_fkey")

    await expect(reconcileUser("owner-ghost")).resolves.toBeUndefined()

    expect(userQuotaService.clearLiveCounters).toHaveBeenCalledWith(
      "owner-ghost",
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  test("an unrelated failure still logs an error and does not clear the key", async () => {
    // A non-FK error (e.g. a connection drop) must keep the old behavior.
    state.insertRejectError = new Error("connection reset")

    await expect(reconcileUser("user-live")).resolves.toBeUndefined()

    expect(userQuotaService.clearLiveCounters).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-live" }),
      "user-quota: failed to reconcile user quota",
    )
  })
})
