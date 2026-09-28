import { beforeEach, describe, expect, test, vi } from "vitest"

const { quotaEnforcementEnv, quotaEnforcementSettings } = vi.hoisted(() => {
  const settings: { QUOTA_MAC_ADMISSION: "atomic" | "lock" } = {
    QUOTA_MAC_ADMISSION: "atomic",
  }
  return {
    quotaEnforcementEnv: vi.fn(() => settings),
    quotaEnforcementSettings: settings,
  }
})
vi.mock("../src/quota-enforcement/keys", () => ({
  quotaEnforcementEnv,
}))

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}))
vi.mock("../src/logger", () => ({ logger }))

const { dbTransaction, fakeTx, findFirstUser, setLocalStatementTimeout } =
  vi.hoisted(() => {
    const fakeTransaction = { __tx: true }
    return {
      fakeTx: fakeTransaction,
      findFirstUser: vi.fn(async () => ({ tenantId: "1" }) as unknown),
      dbTransaction: vi.fn(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          await fn(fakeTransaction),
      ),
      setLocalStatementTimeout: vi.fn(async () => undefined),
    }
  })
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

const macTrackingService = vi.hoisted(() => ({
  claimNewActiveContact: vi.fn(async () => ({ counted: true })),
  incrementWorkspaceMacCache: vi.fn(async () => undefined),
}))
vi.mock("@chatbotx.io/analytics", () => ({
  macAnalyticsService: {
    getActiveContactCountByWorkspaceId: vi.fn(async () => 0),
  },
  macTrackingService,
}))

const workspaceUsageService = vi.hoisted(() => ({
  increment: vi.fn(async () => undefined),
}))
vi.mock("../src/workspace-usage/service", () => ({ workspaceUsageService }))

const distributedLock = vi.hoisted(() => ({
  runExclusive: vi.fn(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  ),
}))
const withCache = vi.hoisted(() =>
  vi.fn(async (_key: string, fn: () => unknown, _options?: unknown) => fn()),
)
vi.mock("@chatbotx.io/redis", () => ({ distributedLock, withCache }))

const tenantService = vi.hoisted(() => ({
  findByOwner: vi.fn(async () => undefined as unknown),
  findById: vi.fn(async () => undefined as unknown),
}))
vi.mock("../src/enterprise/tenant/service", () => ({ tenantService }))

const userQuotaService = vi.hoisted(() => ({
  admit: vi.fn(async () => 1 as number | null),
  commitAdmission: vi.fn(async () => undefined),
  revokeAdmission: vi.fn(async () => undefined),
  getRemainingSlots: vi.fn(async () => null as number | null),
  incrementBy: vi.fn(async () => undefined),
  isLimitReached: vi.fn(async () => false),
  getForUser: vi.fn(async () => null as unknown),
}))
vi.mock("../src/user-quota/service", () => ({ userQuotaService }))

import { quotaEnforcementService } from "../src/quota-enforcement/service"

const ROOT_USER = "root-user"
const RESELLER = "reseller-1"
const CUSTOMER = "customer-1"
const TENANT = "tenant-1"
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

const makeCreate = () => vi.fn(async () => created)

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
  quotaEnforcementSettings.QUOTA_MAC_ADMISSION = "atomic"
  userQuotaService.admit.mockResolvedValue(1)
  userQuotaService.commitAdmission.mockResolvedValue(undefined)
  userQuotaService.revokeAdmission.mockResolvedValue(undefined)
  userQuotaService.getRemainingSlots.mockResolvedValue(null)
  userQuotaService.getForUser.mockResolvedValue(resettingQuota)
  distributedLock.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
  dbTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => await fn(fakeTx),
  )
  macTrackingService.claimNewActiveContact.mockResolvedValue({ counted: true })
  macTrackingService.incrementWorkspaceMacCache.mockResolvedValue(undefined)
  workspaceUsageService.increment.mockResolvedValue(undefined)
})

describe("quotaEnforcementService.createNewContactWithMac atomic", () => {
  test("does not read quota settings at import", async () => {
    vi.resetModules()
    await import("../src/quota-enforcement/service")

    expect(quotaEnforcementEnv).not.toHaveBeenCalled()
  })

  test("does not reparse quota settings on the admission hot path", async () => {
    asRootUser()

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })
    await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(quotaEnforcementEnv.mock.calls.length).toBeLessThanOrEqual(1)
  })

  test("admits, creates, and commits once for a non-pooled owner", async () => {
    asRootUser()
    const calls: string[] = []
    userQuotaService.admit.mockImplementation(() => {
      calls.push("admit")
      return Promise.resolve(1)
    })
    dbTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        calls.push("transaction")
        return await fn(fakeTx)
      },
    )
    userQuotaService.commitAdmission.mockImplementation(() => {
      calls.push("commit")
      return Promise.resolve()
    })

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(calls).toEqual(["admit", "transaction", "commit"])
    expect(userQuotaService.admit).toHaveBeenCalledTimes(1)
    expect(userQuotaService.commitAdmission).toHaveBeenCalledTimes(1)
    expect(distributedLock.runExclusive).not.toHaveBeenCalled()
  })

  test("runs the post-commit tail when the MAC ledger claim is counted", async () => {
    asRootUser()

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(macTrackingService.incrementWorkspaceMacCache).toHaveBeenCalledWith(
      "ws-1",
      1,
    )
    expect(workspaceUsageService.increment).toHaveBeenCalledWith("ws-1", "mac")
    expect(userQuotaService.incrementBy).toHaveBeenCalledWith(
      ROOT_USER,
      "contacts",
      1,
    )
    expect(workspaceUsageService.increment).toHaveBeenCalledWith(
      "ws-1",
      "contacts",
    )
  })

  test("returns a user refusal without creating or revoking for a non-pooled owner", async () => {
    asRootUser()
    userQuotaService.admit.mockResolvedValue(null)

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(result).toEqual({ ok: false, level: "user" })
    expect(dbTransaction).not.toHaveBeenCalled()
    expect(userQuotaService.revokeAdmission).not.toHaveBeenCalled()
    expect(distributedLock.runExclusive).not.toHaveBeenCalled()
  })

  test("propagates a non-pooled admission error without creating or revoking", async () => {
    asRootUser()
    const redisError = new Error("redis unavailable")
    userQuotaService.admit.mockRejectedValue(redisError)

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: ROOT_USER,
        workspaceId: "ws-1",
        create: makeCreate(),
      }),
    ).rejects.toBe(redisError)

    expect(dbTransaction).not.toHaveBeenCalled()
    expect(userQuotaService.revokeAdmission).not.toHaveBeenCalled()
    expect(distributedLock.runExclusive).not.toHaveBeenCalled()
  })

  test("admits and commits pool before user", async () => {
    asCustomer()
    const calls: string[] = []
    const ownerPeriodStart = new Date("2026-09-05T00:00:00Z")
    const ownerQuota = {
      periodStart: ownerPeriodStart,
      periodEnd: new Date("2026-10-05T00:00:00Z"),
    }
    userQuotaService.getForUser.mockImplementation(async (userId: string) =>
      userId === CUSTOMER ? ownerQuota : resettingQuota,
    )
    userQuotaService.admit.mockImplementation((userId: string) => {
      calls.push(`admit:${userId}`)
      return Promise.resolve(1)
    })
    userQuotaService.commitAdmission.mockImplementation((userId: string) => {
      calls.push(`commit:${userId}`)
      return Promise.resolve()
    })

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(calls).toEqual([
      `admit:${RESELLER}`,
      `admit:${CUSTOMER}`,
      `commit:${RESELLER}`,
      `commit:${CUSTOMER}`,
    ])
    expect(macTrackingService.claimNewActiveContact).toHaveBeenCalledWith(
      expect.objectContaining({ periodStart: ownerPeriodStart }),
      fakeTx,
    )
    expect(distributedLock.runExclusive).not.toHaveBeenCalled()
  })

  test("revokes the pool when the user level refuses", async () => {
    asCustomer()
    userQuotaService.admit.mockImplementation(async (userId: string) =>
      userId === CUSTOMER ? null : 1,
    )

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(result).toEqual({ ok: false, level: "user" })
    expect(userQuotaService.revokeAdmission).toHaveBeenCalledWith(
      RESELLER,
      "mac",
    )
    expect(dbTransaction).not.toHaveBeenCalled()
  })

  test("revokes the pool and rethrows the original user admission error", async () => {
    asCustomer()
    const redisError = new Error("redis unavailable")
    userQuotaService.admit.mockImplementation((userId: string) => {
      if (userId === CUSTOMER) {
        return Promise.reject(redisError)
      }
      return Promise.resolve(1)
    })

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: CUSTOMER,
        workspaceId: "ws-1",
        create: makeCreate(),
      }),
    ).rejects.toBe(redisError)

    expect(userQuotaService.revokeAdmission).toHaveBeenCalledWith(
      RESELLER,
      "mac",
    )
    expect(distributedLock.runExclusive).not.toHaveBeenCalled()
  })

  test("rethrows the original admission error when revoking the pool fails", async () => {
    asCustomer()
    const admissionError = new Error("redis unavailable")
    const revokeError = new Error("revoke failed")
    userQuotaService.admit.mockImplementation((userId: string) => {
      if (userId === CUSTOMER) {
        return Promise.reject(admissionError)
      }
      return Promise.resolve(1)
    })
    userQuotaService.revokeAdmission.mockRejectedValue(revokeError)

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: CUSTOMER,
        workspaceId: "ws-1",
        create: makeCreate(),
      }),
    ).rejects.toBe(admissionError)

    expect(logger.warn).toHaveBeenCalledWith(
      {
        err: revokeError,
        level: "pool",
        ownerId: CUSTOMER,
        workspaceId: "ws-1",
      },
      "MAC admission revoke failed",
    )
  })

  test("revokes every admitted level when the transaction throws", async () => {
    asCustomer()
    const transactionError = new Error("transaction failed")
    dbTransaction.mockRejectedValue(transactionError)

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: CUSTOMER,
        workspaceId: "ws-1",
        create: makeCreate(),
      }),
    ).rejects.toBe(transactionError)

    expect(userQuotaService.revokeAdmission).toHaveBeenCalledTimes(2)
    expect(userQuotaService.revokeAdmission).toHaveBeenCalledWith(
      RESELLER,
      "mac",
    )
    expect(userQuotaService.revokeAdmission).toHaveBeenCalledWith(
      CUSTOMER,
      "mac",
    )
  })

  test("counted false revokes MAC and still runs contact counters", async () => {
    asCustomer()
    macTrackingService.claimNewActiveContact.mockResolvedValue({
      counted: false,
    })

    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(result).toEqual({ ok: true, value: { contactId: "c-1" } })
    expect(userQuotaService.revokeAdmission).toHaveBeenCalledTimes(2)
    expect(userQuotaService.revokeAdmission).toHaveBeenCalledWith(
      RESELLER,
      "mac",
    )
    expect(userQuotaService.revokeAdmission).toHaveBeenCalledWith(
      CUSTOMER,
      "mac",
    )
    expect(userQuotaService.commitAdmission).not.toHaveBeenCalled()
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
    expect(workspaceUsageService.increment).toHaveBeenCalledWith(
      "ws-1",
      "contacts",
    )
  })

  test("logs and rethrows commit failure without revoking", async () => {
    asRootUser()
    const commitError = new Error("commit failed")
    userQuotaService.commitAdmission.mockRejectedValue(commitError)

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: ROOT_USER,
        workspaceId: "ws-1",
        create: makeCreate(),
      }),
    ).rejects.toBe(commitError)

    expect(userQuotaService.revokeAdmission).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      { err: commitError, ownerId: ROOT_USER, workspaceId: "ws-1" },
      "MAC admission commit failed after contact creation",
    )
  })

  test("reseller acting directly loads and admits its row once", async () => {
    asReseller()

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: RESELLER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(userQuotaService.getForUser).toHaveBeenCalledTimes(1)
    expect(userQuotaService.getForUser).toHaveBeenCalledWith(RESELLER)
    expect(userQuotaService.admit).toHaveBeenCalledTimes(1)
  })
})

describe("quotaEnforcementService.createNewContactWithMac lock", () => {
  test("dispatches a forced lock before loading resetting quota rows", async () => {
    quotaEnforcementSettings.QUOTA_MAC_ADMISSION = "lock"
    asRootUser()
    userQuotaService.getForUser.mockResolvedValue(resettingQuota)

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(distributedLock.runExclusive).toHaveBeenCalledTimes(1)
    expect(userQuotaService.admit).not.toHaveBeenCalled()
    expect(userQuotaService.getForUser).toHaveBeenCalledTimes(1)
    expect(
      distributedLock.runExclusive.mock.invocationCallOrder[0],
    ).toBeLessThan(userQuotaService.getForUser.mock.invocationCallOrder[0] ?? 0)
  })

  test.each([
    ["lifetime", { periodStart, periodEnd: null }],
    ["period-less", { periodStart: null, periodEnd: new Date() }],
    ["missing", null],
  ])("dispatches a non-pooled %s quota row through the lock", async (_name, quota) => {
    asRootUser()
    userQuotaService.getForUser.mockResolvedValue(quota)

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(distributedLock.runExclusive).toHaveBeenCalledTimes(1)
    expect(userQuotaService.admit).not.toHaveBeenCalled()
  })

  test.each([
    ["pool", RESELLER, { periodStart, periodEnd: null }],
    ["user", CUSTOMER, { periodStart: null, periodEnd: new Date() }],
  ])("dispatches through the lock when the pooled %s row cannot use atomic admission", async (_level, nonResettingUserId, nonResettingQuota) => {
    asCustomer()
    userQuotaService.getForUser.mockImplementation(async (userId: string) =>
      userId === nonResettingUserId ? nonResettingQuota : resettingQuota,
    )

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: CUSTOMER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(distributedLock.runExclusive).toHaveBeenCalledTimes(1)
    expect(userQuotaService.admit).not.toHaveBeenCalled()
  })

  test("keeps the main lock path and refreshes the owner period inside it", async () => {
    asRootUser()
    const lockedPeriodStart = new Date("2026-10-01T00:00:00Z")
    userQuotaService.getForUser
      .mockResolvedValueOnce({ periodStart, periodEnd: null })
      .mockResolvedValueOnce({
        periodStart: lockedPeriodStart,
        periodEnd: null,
      })
    userQuotaService.getRemainingSlots.mockResolvedValue(5)

    await quotaEnforcementService.createNewContactWithMac({
      ownerId: ROOT_USER,
      workspaceId: "ws-1",
      create: makeCreate(),
    })

    expect(distributedLock.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `quota:user:${ROOT_USER}:mac`,
        timeoutInSeconds: 30,
        retryTimeoutInSeconds: 30,
      }),
    )
    expect(macTrackingService.claimNewActiveContact).toHaveBeenCalledWith(
      expect.objectContaining({ periodStart: lockedPeriodStart }),
      fakeTx,
    )
  })

  test("lets LockAcquisitionError escape unchanged", async () => {
    asRootUser()
    userQuotaService.getForUser.mockResolvedValue({
      periodStart,
      periodEnd: null,
    })
    const lockError = Object.assign(new Error("lock contention"), {
      name: "LockAcquisitionError",
    })
    distributedLock.runExclusive.mockRejectedValue(lockError)

    await expect(
      quotaEnforcementService.createNewContactWithMac({
        ownerId: ROOT_USER,
        workspaceId: "ws-1",
        create: makeCreate(),
      }),
    ).rejects.toBe(lockError)
  })
})
