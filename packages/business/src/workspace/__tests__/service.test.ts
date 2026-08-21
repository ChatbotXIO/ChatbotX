import { beforeEach, describe, expect, test, vi } from "vitest"
import { ChatbotXException } from "../../errors"

const mocks = vi.hoisted(() => ({
  businessLoggerError: vi.fn(),
  workspaceInsert: vi.fn(),
  workspaceInsertValues: vi.fn(),
  workspaceDelete: vi.fn(),
  tryConsume: vi.fn(),
  createMember: vi.fn(),
  getForUser: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  dbTransaction: vi.fn(),
  purgeWorkspaceHeavyData: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  anchoredPeriod: vi.fn(() => ({ start: new Date(), end: new Date() })),
  macRepository: { ensureWorkspaceMac: vi.fn(async () => undefined) },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { userModel: { findFirst: vi.fn(async () => undefined) } },
    insert: mocks.workspaceInsert,
    delete: mocks.workspaceDelete,
    transaction: mocks.dbTransaction,
  },
  describeDatabaseError: vi.fn((error: unknown) => {
    const cause = error instanceof Error ? error.cause : undefined
    if (
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      "message" in cause
    ) {
      const pgCause = cause as {
        code?: string
        detail?: string
        message?: string
        table?: string
      }
      return {
        code: pgCause.code,
        constraint: undefined,
        detail: pgCause.detail,
        message: pgCause.message,
        table: pgCause.table,
      }
    }
    return { message: error instanceof Error ? error.message : String(error) }
  }),
  eq: vi.fn((column, value) => ({ column, value })),
  inArray: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/partials")>()
  return {
    ...actual,
    workspaceMemberRoles: { enum: { owner: "owner" } },
  }
})

vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  workspaceMemberModel: {},
  workspaceModel: {},
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(async (_key: string, resolver: () => unknown) => resolver()),
  invalidateCacheByTags: mocks.invalidateCacheByTags,
  distributedLock: {
    runExclusive: vi.fn(async ({ fn }: { fn: () => unknown }) => fn()),
  },
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  PURGE_WORKSPACES_INTERVAL_MINUTES: 30,
}))

// These suites exercise the quota-driven create path; the community
// workspace cap is covered by __tests__/workspace.service.test.ts.
vi.mock("../../keys", () => ({ isCommunity: vi.fn(() => false) }))

vi.mock("../../enterprise/tenant/service", () => ({
  tenantService: { findByOwner: vi.fn(async () => undefined) },
}))

vi.mock("../../logger", () => ({
  logger: {
    error: mocks.businessLoggerError,
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("../../quota-enforcement/service", () => ({
  quotaEnforcementService: {
    tryConsume: mocks.tryConsume,
    release: vi.fn(async () => undefined),
  },
}))

vi.mock("../../user-quota/service", () => ({
  userQuotaService: {
    getForUser: mocks.getForUser,
    reconcileOwnerPoolUsage: vi.fn(async () => undefined),
  },
}))

vi.mock("../../workspace-lifecycle/service", () => ({
  workspaceLifecycleService: {
    freezeWorkspaceRuntime: vi.fn(async () => undefined),
    disconnectWorkspaceIntegrations: vi.fn(async () => undefined),
    disconnectWorkspaceChannels: vi.fn(async () => undefined),
    purgeWorkspaceHeavyData: mocks.purgeWorkspaceHeavyData,
  },
}))

vi.mock("../../workspace-member/service", () => ({
  workspaceMemberCacheTag: vi.fn((userId: string) => `member:${userId}`),
  workspaceMemberService: {
    create: mocks.createMember,
    listUserIdsByWorkspaceId: vi.fn(async () => []),
  },
}))

const { workspaceService } = await import("../service")

beforeEach(() => {
  mocks.businessLoggerError.mockReset()
  mocks.workspaceInsert.mockReset()
  mocks.workspaceInsertValues.mockReset()
  mocks.workspaceDelete.mockReset()
  mocks.tryConsume.mockReset()
  mocks.createMember.mockReset()
  mocks.createMember.mockResolvedValue(undefined)
  mocks.getForUser.mockReset()
  mocks.getForUser.mockResolvedValue(undefined)
  mocks.invalidateCacheByTags.mockReset()
  mocks.dbTransaction.mockReset()
  mocks.purgeWorkspaceHeavyData.mockReset()
  mocks.purgeWorkspaceHeavyData.mockResolvedValue(0)

  mocks.workspaceInsert.mockReturnValue({
    values: mocks.workspaceInsertValues.mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "new-workspace" }]),
    }),
  })
  mocks.workspaceDelete.mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  })
})

describe("WorkspaceService.create", () => {
  test("throws a typed workspaceLimitReached exception when the owner's quota is exhausted", async () => {
    mocks.tryConsume.mockResolvedValue({ ok: false })

    const createWorkspace = workspaceService.create({
      data: { name: "Acme" } as never,
      createdBy: "owner-1",
    })

    await expect(createWorkspace).rejects.toMatchObject({
      code: "workspaceLimitReached",
      message: "Workspace limit reached for this plan",
    })
    await expect(createWorkspace.catch((err) => err)).resolves.toBeInstanceOf(
      ChatbotXException,
    )
    expect(mocks.workspaceInsert).not.toHaveBeenCalled()
  })

  test("creates the workspace and its owner membership when the quota allows it", async () => {
    mocks.tryConsume.mockResolvedValue({ ok: true })

    const result = await workspaceService.create({
      data: { name: "Acme", tenantId: "1" } as never,
      createdBy: "owner-1",
    })

    expect(result).toEqual({ id: "new-workspace" })
    expect(mocks.workspaceInsert).toHaveBeenCalledTimes(1)
    expect(mocks.createMember).toHaveBeenCalledTimes(1)
  })
})

describe("WorkspaceService.purgeDueScheduled", () => {
  test("deletes only workspaces that tear down cleanly and never aborts the run on a single failure", async () => {
    const claimedRows = [
      { id: "w1", ownerId: "o1", tenantId: "t1" },
      { id: "w2", ownerId: "o2", tenantId: "t2" },
    ]
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: claimedRows }),
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    }
    mocks.dbTransaction.mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(tx),
    )

    // w1's teardown throws; w2 succeeds.
    mocks.purgeWorkspaceHeavyData.mockImplementation(
      ({ workspaceId }: { workspaceId: string }) =>
        workspaceId === "w1"
          ? Promise.reject(new Error("teardown boom"))
          : Promise.resolve(0),
    )

    // Resolves (does not throw) and counts only the workspace that succeeded.
    await expect(workspaceService.purgeDueScheduled()).resolves.toBe(1)
    // The failed workspace keeps its row; only the clean one is deleted.
    expect(mocks.workspaceDelete).toHaveBeenCalledTimes(1)
  })

  test("tears down up to five claimed workspaces concurrently", async () => {
    const claimedRows = Array.from({ length: 6 }, (_, index) => ({
      id: `w${index + 1}`,
      ownerId: `o${index + 1}`,
      tenantId: `t${index + 1}`,
    }))
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: claimedRows }),
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    }
    mocks.dbTransaction.mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(tx),
    )

    let active = 0
    let maxActive = 0
    mocks.purgeWorkspaceHeavyData.mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      return 0
    })

    await expect(
      workspaceService.purgeDueScheduled({ chunkSize: 6, maxChunks: 1 }),
    ).resolves.toBe(6)

    expect(mocks.purgeWorkspaceHeavyData).toHaveBeenCalledTimes(6)
    expect(maxActive).toBe(5)
    expect(mocks.workspaceDelete).toHaveBeenCalledTimes(6)
  })

  test("logs the underlying postgres cause when workspace row delete fails", async () => {
    const claimedRows = [{ id: "w1", ownerId: "o1", tenantId: "t1" }]
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: claimedRows }),
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    }
    mocks.dbTransaction.mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(tx),
    )
    const pgCause = Object.assign(new Error("statement timeout"), {
      code: "57014",
      detail: "canceling statement due to statement timeout",
      table: "Workspace",
    })
    const deleteError = new Error("Failed query", { cause: pgCause })
    mocks.workspaceDelete.mockReturnValueOnce({
      where: vi.fn().mockRejectedValue(deleteError),
    })

    await expect(
      workspaceService.purgeDueScheduled({ chunkSize: 1, maxChunks: 1 }),
    ).resolves.toBe(0)

    expect(mocks.businessLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        dbCause: {
          code: "57014",
          constraint: undefined,
          detail: "canceling statement due to statement timeout",
          message: "statement timeout",
          table: "Workspace",
        },
        err: deleteError,
        workspaceId: "w1",
      }),
      "workspace-purge: teardown failed, deferring to next run",
    )
  })
})
