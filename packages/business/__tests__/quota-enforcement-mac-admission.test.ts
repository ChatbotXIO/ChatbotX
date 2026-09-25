import { beforeEach, describe, expect, test, vi } from "vitest"

const quotaEnforcementSettings = vi.hoisted(() => ({
  QUOTA_MAC_ADMISSION: "reserve" as "reserve" | "lock",
}))
vi.mock("../src/quota-enforcement/keys", () => ({
  quotaEnforcementEnv: () => quotaEnforcementSettings,
}))

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}))
vi.mock("../src/logger", () => ({ logger }))

const findFirstUser = vi.fn(async () => ({ tenantId: "1" }) as unknown)
const fakeTx = { __tx: true }
const transactionState = { committed: false, rolledBack: false }
const dbTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  try {
    const result = await fn(fakeTx)
    transactionState.committed = true
    return result
  } catch (error) {
    transactionState.rolledBack = true
    throw error
  }
})
const setLocalStatementTimeout = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { userModel: { findFirst: findFirstUser } },
    transaction: dbTransaction,
  },
  setLocalStatementTimeout,
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  workspaceUsageModel: { workspaceId: "workspaceId-column" },
}))

const macTrackingService = {
  claimNewActiveContact: vi.fn(async () => ({ counted: true })),
  incrementWorkspaceMacCache: vi.fn(async () => undefined),
}
vi.mock("@chatbotx.io/analytics", () => ({
  macAnalyticsService: {
    getActiveContactCountByWorkspaceId: vi.fn(async () => 0),
  },
  macTrackingService,
}))

const workspaceUsageService = {
  increment: vi.fn(async () => undefined),
}
vi.mock("../src/workspace-usage/service", () => ({ workspaceUsageService }))

const distributedLock = {
  runExclusive: vi.fn(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  ),
}
const withCache = vi.fn(
  async (_key: string, fn: () => unknown, _options?: unknown) => fn(),
)
vi.mock("@chatbotx.io/redis", () => ({ distributedLock, withCache }))

const tenantService = {
  findByOwner: vi.fn(async () => undefined as unknown),
  findById: vi.fn(async () => undefined as unknown),
}
vi.mock("../src/enterprise/tenant/service", () => ({ tenantService }))

const userQuotaService = {
  getRemainingSlots: vi.fn(async () => null as number | null),
  incrementBy: vi.fn(async () => undefined),
  reserve: vi.fn(
    async () =>
      ({ id: "reservation-1", value: 1 }) as {
        id: string
        value: number
      } | null,
  ),
  touchReservation: vi.fn(async () => true),
  commitReservation: vi.fn(async () => undefined),
  releaseReservation: vi.fn(async () => undefined),
  getForUser: vi.fn(async () => null as unknown),
}
vi.mock("../src/user-quota/service", () => ({ userQuotaService }))

const { quotaEnforcementService, resolveMacAdmissionStrategy } = await import(
  "../src/quota-enforcement/service"
)

const ROOT_USER = "root-user"
const RESELLER = "reseller-1"
const CUSTOMER = "customer-1"
const TENANT = "tenant-1"

const quotaLevel = (
  quota: { periodStart: Date | null; periodEnd: Date | null } | null,
) => ({ userId: ROOT_USER, level: "user" as const, quota: quota as never })

const asRootUser = () => {
  findFirstUser.mockResolvedValue({ tenantId: "1" })
  tenantService.findByOwner.mockResolvedValue(undefined)
}

const asReseller = () => {
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
  transactionState.committed = false
  transactionState.rolledBack = false
  quotaEnforcementSettings.QUOTA_MAC_ADMISSION = "reserve"
  userQuotaService.getRemainingSlots.mockResolvedValue(null)
  userQuotaService.reserve.mockResolvedValue({
    id: "reservation-1",
    value: 1,
  })
  userQuotaService.touchReservation.mockResolvedValue(true)
  userQuotaService.commitReservation.mockResolvedValue(undefined)
  userQuotaService.releaseReservation.mockResolvedValue(undefined)
  dbTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      try {
        const result = await fn(fakeTx)
        transactionState.committed = true
        return result
      } catch (error) {
        transactionState.rolledBack = true
        throw error
      }
    },
  )
  macTrackingService.claimNewActiveContact.mockResolvedValue({ counted: true })
  macTrackingService.incrementWorkspaceMacCache.mockResolvedValue(undefined)
  workspaceUsageService.increment.mockResolvedValue(undefined)
})

describe("resolveMacAdmissionStrategy", () => {
  test("uses reservation for a resetting plan when reservation is preferred", () => {
    expect(
      resolveMacAdmissionStrategy({
        preferred: "reserve",
        levels: [
          quotaLevel({
            periodStart: new Date("2026-09-01T00:00:00Z"),
            periodEnd: new Date("2026-10-01T00:00:00Z"),
          }),
        ],
      }),
    ).toBe("reserve")
  })

  test("uses the lock for a lifetime plan", () => {
    expect(
      resolveMacAdmissionStrategy({
        preferred: "reserve",
        levels: [
          quotaLevel({
            periodStart: new Date("2026-09-01T00:00:00Z"),
            periodEnd: null,
          }),
        ],
      }),
    ).toBe("lock")
  })

  test("uses the lock for a period-less owner", () => {
    expect(
      resolveMacAdmissionStrategy({
        preferred: "reserve",
        levels: [
          quotaLevel({
            periodStart: null,
            periodEnd: new Date("2026-10-01T00:00:00Z"),
          }),
        ],
      }),
    ).toBe("lock")
  })

  test("uses the lock when there is no quota row", () => {
    expect(
      resolveMacAdmissionStrategy({
        preferred: "reserve",
        levels: [quotaLevel(null)],
      }),
    ).toBe("lock")
  })

  test("uses the lock when any quota level is lifetime", () => {
    expect(
      resolveMacAdmissionStrategy({
        preferred: "reserve",
        levels: [
          quotaLevel({
            periodStart: new Date("2026-09-01T00:00:00Z"),
            periodEnd: new Date("2026-10-01T00:00:00Z"),
          }),
          quotaLevel({
            periodStart: new Date("2026-09-01T00:00:00Z"),
            periodEnd: null,
          }),
        ],
      }),
    ).toBe("lock")
  })

  test("honors the lock rollback preference for a resetting plan", () => {
    expect(
      resolveMacAdmissionStrategy({
        preferred: "lock",
        levels: [
          quotaLevel({
            periodStart: new Date("2026-09-01T00:00:00Z"),
            periodEnd: new Date("2026-10-01T00:00:00Z"),
          }),
        ],
      }),
    ).toBe("lock")
  })
})

describe("quotaEnforcementService.createNewContactWithMac lock", () => {
  const created = {
    value: { contactId: "c-1" },
    contactId: "c-1",
    contactInboxId: "ci-1",
    inboxId: "inbox-1",
  }
  const makeCreate = () => vi.fn(async () => created)

  beforeEach(() => {
    quotaEnforcementSettings.QUOTA_MAC_ADMISSION = "lock"
  })

  test("refreshes the owner period inside the lock before claiming the ledger row", async () => {
    asRootUser()
    const preLockPeriodStart = new Date("2026-09-01T00:00:00Z")
    const lockedPeriodStart = new Date("2026-10-01T00:00:00Z")
    userQuotaService.getRemainingSlots.mockResolvedValue(5)
    userQuotaService.getForUser
      .mockResolvedValueOnce({ periodStart: preLockPeriodStart })
      .mockResolvedValueOnce({ periodStart: lockedPeriodStart })

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(userQuotaService.getForUser).toHaveBeenCalledTimes(2)
    expect(macTrackingService.claimNewActiveContact).toHaveBeenCalledWith(
      expect.objectContaining({ periodStart: lockedPeriodStart }),
      fakeTx,
    )
  })
})

describe("quotaEnforcementService.createNewContactWithMac reservation", () => {
  const periodStart = new Date("2026-09-01T00:00:00Z")
  const resettingQuota = {
    periodStart,
    periodEnd: new Date("2026-10-01T00:00:00Z"),
  }
  const created = {
    value: { contactId: "c-1" },
    contactId: "c-1",
    contactInboxId: "ci-1",
    inboxId: "inbox-1",
  }
  const reservation = { id: "reservation-1", value: 1 }
  const makeCreate = () => vi.fn(async () => created)

  beforeEach(() => {
    quotaEnforcementSettings.QUOTA_MAC_ADMISSION = "reserve"
    userQuotaService.getForUser.mockResolvedValue(resettingQuota)
    userQuotaService.reserve.mockResolvedValue(reservation)
  })

  test("root user reserves, creates, commits, and bumps caches without locking", async () => {
    asRootUser()
    const create = makeCreate()

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create,
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(userQuotaService.getForUser).toHaveBeenCalledTimes(1)
    expect(userQuotaService.getForUser).toHaveBeenCalledWith(ROOT_USER)
    expect(userQuotaService.reserve).toHaveBeenCalledWith(
      ROOT_USER,
      "mac",
      resettingQuota,
    )
    expect(userQuotaService.commitReservation).toHaveBeenCalledWith(
      ROOT_USER,
      "mac",
      reservation,
    )
    expect(userQuotaService.releaseReservation).not.toHaveBeenCalled()
    expect(userQuotaService.touchReservation).toHaveBeenCalledWith(
      ROOT_USER,
      "mac",
      reservation,
    )
    expect(distributedLock.runExclusive).not.toHaveBeenCalled()
    expect(macTrackingService.incrementWorkspaceMacCache).toHaveBeenCalledWith(
      "ws-1",
      1,
    )
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      ROOT_USER,
      "contacts",
      1,
    )
  })

  test("commits each pooled level with its own reservation", async () => {
    asCustomer()
    const ownerPeriodStart = new Date("2026-09-05T00:00:00Z")
    const ownerQuota = {
      periodStart: ownerPeriodStart,
      periodEnd: new Date("2026-10-05T00:00:00Z"),
    }
    const poolQuota = {
      periodStart,
      periodEnd: new Date("2026-10-01T00:00:00Z"),
    }
    const poolReservation = { id: "pool-reservation", value: 4 }
    const userReservation = { id: "user-reservation", value: 2 }
    userQuotaService.getForUser.mockImplementation(async (userId: string) =>
      userId === RESELLER ? poolQuota : ownerQuota,
    )
    userQuotaService.reserve.mockImplementation((userId: string) =>
      Promise.resolve(userId === RESELLER ? poolReservation : userReservation),
    )

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(userQuotaService.getForUser).toHaveBeenCalledTimes(2)
    expect(userQuotaService.getForUser).toHaveBeenCalledWith(CUSTOMER)
    expect(userQuotaService.getForUser).toHaveBeenCalledWith(RESELLER)
    expect(macTrackingService.claimNewActiveContact).toHaveBeenCalledWith(
      expect.objectContaining({ periodStart: ownerPeriodStart }),
      fakeTx,
    )
    expect(userQuotaService.reserve).toHaveBeenNthCalledWith(
      1,
      RESELLER,
      "mac",
      poolQuota,
    )
    expect(userQuotaService.reserve).toHaveBeenNthCalledWith(
      2,
      CUSTOMER,
      "mac",
      ownerQuota,
    )
    expect(userQuotaService.commitReservation).toHaveBeenNthCalledWith(
      1,
      RESELLER,
      "mac",
      poolReservation,
    )
    expect(userQuotaService.commitReservation).toHaveBeenNthCalledWith(
      2,
      CUSTOMER,
      "mac",
      userReservation,
    )
    expect(userQuotaService.touchReservation).toHaveBeenNthCalledWith(
      1,
      RESELLER,
      "mac",
      poolReservation,
    )
    expect(userQuotaService.touchReservation).toHaveBeenNthCalledWith(
      2,
      CUSTOMER,
      "mac",
      userReservation,
    )
  })

  test("refuses at the user level before starting a transaction", async () => {
    asRootUser()
    userQuotaService.reserve.mockResolvedValue(null)
    const create = makeCreate()

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create,
    })

    expect(result).toEqual({ ok: false, level: "user" })
    expect(dbTransaction).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  test("refuses at the pool level before starting a transaction", async () => {
    asCustomer()
    userQuotaService.reserve.mockImplementation(async (userId: string) =>
      userId === RESELLER ? null : reservation,
    )
    const create = makeCreate()

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create,
    })

    expect(result).toEqual({ ok: false, level: "pool" })
    expect(userQuotaService.reserve).toHaveBeenCalledTimes(1)
    expect(userQuotaService.reserve).toHaveBeenCalledWith(
      RESELLER,
      "mac",
      resettingQuota,
    )
    expect(dbTransaction).not.toHaveBeenCalled()
  })

  test("pooled owner with an unlimited pool and a capped sub-account enforces the sub-account cap and releases the pool reservation on refusal", async () => {
    asCustomer()
    const unlimitedPoolReservation = {
      id: "pool-reservation",
      value: 4,
    }
    const poolQuota = { ...resettingQuota, macLimit: null }
    const userQuota = { ...resettingQuota, macLimit: 1 }
    userQuotaService.getForUser.mockImplementation(async (userId: string) =>
      userId === RESELLER ? poolQuota : userQuota,
    )
    userQuotaService.reserve.mockImplementation(async (userId: string) =>
      userId === RESELLER ? unlimitedPoolReservation : null,
    )
    const create = makeCreate()

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create,
    })

    expect(result).toEqual({ ok: false, level: "user" })
    expect(userQuotaService.reserve).toHaveBeenNthCalledWith(
      1,
      RESELLER,
      "mac",
      expect.objectContaining({ macLimit: null }),
    )
    expect(userQuotaService.reserve).toHaveBeenNthCalledWith(
      2,
      CUSTOMER,
      "mac",
      userQuota,
    )
    expect(userQuotaService.releaseReservation).toHaveBeenCalledWith(
      RESELLER,
      "mac",
      unlimitedPoolReservation,
    )
    expect(dbTransaction).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  test("releases every reserved level when create throws", async () => {
    asCustomer()
    const createError = new Error("create failed")
    const create = vi.fn(() => Promise.reject(createError))

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: CUSTOMER,
        workspaceId: "ws-1",
        create,
      }),
    ).rejects.toBe(createError)

    expect(userQuotaService.releaseReservation).toHaveBeenNthCalledWith(
      1,
      CUSTOMER,
      "mac",
      reservation,
    )
    expect(userQuotaService.releaseReservation).toHaveBeenNthCalledWith(
      2,
      RESELLER,
      "mac",
      reservation,
    )
    expect(userQuotaService.commitReservation).not.toHaveBeenCalled()
  })

  test("touches every reserved level as the transaction's last statement", async () => {
    asCustomer()
    const poolReservation = { id: "pool-reservation", value: 1 }
    const userReservation = { id: "user-reservation", value: 1 }
    userQuotaService.reserve.mockImplementation(async (userId: string) =>
      userId === RESELLER ? poolReservation : userReservation,
    )

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(userQuotaService.touchReservation).toHaveBeenNthCalledWith(
      1,
      RESELLER,
      "mac",
      poolReservation,
    )
    expect(userQuotaService.touchReservation).toHaveBeenNthCalledWith(
      2,
      CUSTOMER,
      "mac",
      userReservation,
    )
    expect(
      macTrackingService.claimNewActiveContact.mock.invocationCallOrder[0],
    ).toBeLessThan(
      userQuotaService.touchReservation.mock.invocationCallOrder[0] as number,
    )
  })

  test("throws ReservationLostError so the transaction rolls back when touch fails", async () => {
    asRootUser()
    userQuotaService.touchReservation.mockResolvedValue(false)

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: ROOT_USER,
        workspaceId: "ws-1",
        create: makeCreate(),
      }),
    ).rejects.toMatchObject({ name: "ReservationLostError" })

    expect(dbTransaction).toHaveBeenCalledOnce()
    expect(userQuotaService.commitReservation).not.toHaveBeenCalled()
    expect(userQuotaService.releaseReservation).toHaveBeenCalledWith(
      ROOT_USER,
      "mac",
      reservation,
    )
    expect(transactionState).toEqual({ committed: false, rolledBack: true })
  })

  test("rolls back and releases every level when a touch call rejects", async () => {
    asCustomer()
    const touchError = new Error("redis touch failed")
    const poolReservation = { id: "pool-reservation", value: 1 }
    const userReservation = { id: "user-reservation", value: 1 }
    userQuotaService.reserve.mockImplementation(async (userId: string) =>
      userId === RESELLER ? poolReservation : userReservation,
    )
    userQuotaService.touchReservation.mockImplementation((userId: string) =>
      userId === CUSTOMER ? Promise.reject(touchError) : Promise.resolve(true),
    )

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: CUSTOMER,
        workspaceId: "ws-1",
        create: makeCreate(),
      }),
    ).rejects.toBe(touchError)

    expect(transactionState).toEqual({ committed: false, rolledBack: true })
    expect(userQuotaService.releaseReservation).toHaveBeenNthCalledWith(
      1,
      CUSTOMER,
      "mac",
      userReservation,
    )
    expect(userQuotaService.releaseReservation).toHaveBeenNthCalledWith(
      2,
      RESELLER,
      "mac",
      poolReservation,
    )
    expect(userQuotaService.commitReservation).not.toHaveBeenCalled()
  })

  test("releases the reservation when the ledger already counted the contact", async () => {
    asRootUser()
    macTrackingService.claimNewActiveContact.mockResolvedValue({
      counted: false,
    })

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(userQuotaService.releaseReservation).toHaveBeenCalledWith(
      ROOT_USER,
      "mac",
      reservation,
    )
    expect(userQuotaService.commitReservation).not.toHaveBeenCalled()
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      ROOT_USER,
      "contacts",
      1,
    )
  })

  test("logs and rethrows a commit failure without releasing", async () => {
    asRootUser()
    const commitError = new Error("commit failed")
    userQuotaService.commitReservation.mockRejectedValue(commitError)

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: ROOT_USER,
        workspaceId: "ws-1",
        create: makeCreate(),
      }),
    ).rejects.toBe(commitError)

    expect(logger.error).toHaveBeenCalledWith(
      { err: commitError, ownerId: ROOT_USER, workspaceId: "ws-1" },
      expect.any(String),
    )
    expect(userQuotaService.releaseReservation).not.toHaveBeenCalled()
  })

  test("keeps the first pooled level committed when the second commit throws", async () => {
    asCustomer()
    const commitError = new Error("user commit failed")
    const poolReservation = { id: "pool-reservation", value: 4 }
    const userReservation = { id: "user-reservation", value: 2 }
    userQuotaService.reserve.mockImplementation(async (userId: string) =>
      userId === RESELLER ? poolReservation : userReservation,
    )
    userQuotaService.commitReservation.mockImplementation((userId: string) =>
      userId === CUSTOMER
        ? Promise.reject(commitError)
        : Promise.resolve(undefined),
    )

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: CUSTOMER,
        workspaceId: "ws-1",
        create: makeCreate(),
      }),
    ).rejects.toBe(commitError)

    expect(transactionState).toEqual({ committed: true, rolledBack: false })
    expect(userQuotaService.commitReservation).toHaveBeenNthCalledWith(
      1,
      RESELLER,
      "mac",
      poolReservation,
    )
    expect(userQuotaService.commitReservation).toHaveBeenNthCalledWith(
      2,
      CUSTOMER,
      "mac",
      userReservation,
    )
    expect(userQuotaService.releaseReservation).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      { err: commitError, ownerId: CUSTOMER, workspaceId: "ws-1" },
      "MAC reservation commit failed after contact creation",
    )
  })

  test("rethrows when reservation fails and never takes the lock", async () => {
    asCustomer()
    const reserveError = new Error("redis unavailable")
    userQuotaService.reserve.mockImplementation((userId: string) => {
      if (userId === CUSTOMER) {
        return Promise.reject(reserveError)
      }
      return Promise.resolve(reservation)
    })
    const create = makeCreate()

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: CUSTOMER,
        workspaceId: "ws-1",
        create,
      }),
    ).rejects.toBe(reserveError)
    expect(userQuotaService.releaseReservation).toHaveBeenCalledWith(
      RESELLER,
      "mac",
      reservation,
    )
    expect(logger.error).toHaveBeenCalledWith(
      { err: reserveError, ownerId: CUSTOMER, workspaceId: "ws-1" },
      "MAC reservation failed",
    )
    expect(distributedLock.runExclusive).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  test("admits exactly two of five concurrent creates when two slots remain", async () => {
    asRootUser()
    let reserved = 0
    userQuotaService.reserve.mockImplementation(() => {
      if (reserved >= 2) {
        return Promise.resolve(null)
      }
      reserved += 1
      return Promise.resolve({ id: `reservation-${reserved}`, value: reserved })
    })
    const create = makeCreate()

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        quotaEnforcementService.createNewContactWithMac({
          ownerId: ROOT_USER,
          workspaceId: "ws-1",
          create,
        }),
      ),
    )

    expect(results.filter((result) => result.ok)).toHaveLength(2)
    expect(results.filter((result) => !result.ok)).toHaveLength(3)
    expect(create).toHaveBeenCalledTimes(2)
    expect(distributedLock.runExclusive).not.toHaveBeenCalled()
  })

  test("uses the lock strategy for a lifetime owner even when reservation is preferred", async () => {
    asRootUser()
    userQuotaService.getForUser.mockResolvedValue({
      periodStart,
      periodEnd: null,
    })
    userQuotaService.getRemainingSlots.mockResolvedValue(5)

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(userQuotaService.reserve).not.toHaveBeenCalled()
    expect(distributedLock.runExclusive).toHaveBeenCalledTimes(1)
  })

  test("uses the lock when the reseller resets but the sub-account is lifetime", async () => {
    asCustomer()
    const poolQuota = resettingQuota
    const userQuota = { periodStart, periodEnd: null }
    userQuotaService.getForUser.mockImplementation(async (userId: string) =>
      userId === RESELLER ? poolQuota : userQuota,
    )
    userQuotaService.getRemainingSlots.mockResolvedValue(5)

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(distributedLock.runExclusive).toHaveBeenCalledTimes(1)
    expect(userQuotaService.reserve).not.toHaveBeenCalled()
  })

  test("uses the lock when the reseller is lifetime but the sub-account resets", async () => {
    asCustomer()
    const poolQuota = { periodStart, periodEnd: null }
    const userQuota = resettingQuota
    userQuotaService.getForUser.mockImplementation(async (userId: string) =>
      userId === RESELLER ? poolQuota : userQuota,
    )
    userQuotaService.getRemainingSlots.mockResolvedValue(5)

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(distributedLock.runExclusive).toHaveBeenCalledTimes(1)
    expect(userQuotaService.reserve).not.toHaveBeenCalled()
  })

  test("uses reservation when both reseller and sub-account reset", async () => {
    asCustomer()
    userQuotaService.getForUser.mockResolvedValue(resettingQuota)

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(distributedLock.runExclusive).not.toHaveBeenCalled()
    expect(userQuotaService.reserve).toHaveBeenCalledTimes(2)
  })

  test("reseller acting directly reads and reserves its row once", async () => {
    asReseller()

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: RESELLER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(userQuotaService.getForUser).toHaveBeenCalledTimes(1)
    expect(userQuotaService.getForUser).toHaveBeenCalledWith(RESELLER)
    expect(userQuotaService.reserve).toHaveBeenCalledTimes(1)
    expect(userQuotaService.reserve).toHaveBeenCalledWith(
      RESELLER,
      "mac",
      resettingQuota,
    )
  })
})
