import { beforeEach, describe, expect, test, vi } from "vitest"

const returningWorkspace = vi.fn(async () => [
  { id: "ws-1", organizationId: "org-1" },
])
const valuesWorkspace = vi.fn(() => ({ returning: returningWorkspace }))
const insert = vi.fn(() => ({ values: valuesWorkspace }))

const returningUpdatedWorkspace = vi.fn(async () => [
  { id: "ws-1", name: "New Name" },
])
const whereUpdate = vi.fn(() => ({ returning: returningUpdatedWorkspace }))
const setUpdate = vi.fn(() => ({ where: whereUpdate }))
const update = vi.fn(() => ({ set: setUpdate }))

const findFirstUser = vi.fn(async () => ({ tenantId: "1" }))
const findFirstWorkspace = vi.fn(async () => ({ name: "Old Name" }))
const findFirstFlow = vi.fn(async () => ({ id: "11" }))
const countWorkspaces = vi.fn(async () => 0)
const transaction = vi.fn(
  async (fn: (tx: unknown) => unknown): Promise<unknown> => await fn(db),
)
const db: Record<string, unknown> = {
  insert,
  update,
  transaction,
  $count: countWorkspaces,
  query: {
    userModel: { findFirst: findFirstUser },
    workspaceModel: { findFirst: findFirstWorkspace },
    flowModel: { findFirst: findFirstFlow },
  },
}
vi.mock("@chatbotx.io/database/client", () => ({
  db,
  and: vi.fn(),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  isNull: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceModel: {},
  workspaceUsageModel: { workspaceId: "workspaceId-column" },
  ROOT_TENANT_ID: "1",
}))
// `workspace/service.ts` doesn't use `@chatbotx.io/database/repositories`, but
// vitest's SSR deps optimizer bundles the whole `@chatbotx.io/database`
// package graph together once any subpath is imported, which otherwise pulls
// in `contactRepository`'s real contact-filter query graph (needs the real
// schema, conflicting with the narrow mock above).
vi.mock("@chatbotx.io/database/repositories", () => ({}))

const tenantService = { findByOwner: vi.fn(async () => undefined as unknown) }
vi.mock("../src/enterprise/tenant/service", () => ({ tenantService }))
vi.mock("@chatbotx.io/database/partials", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/partials")>()
  return {
    ...actual,
    workspaceMemberRoles: { enum: { owner: "owner" } },
  }
})
const invalidateCacheByTags = vi.fn(async () => undefined)
const runExclusive = vi.fn(async ({ fn }: { key: string; fn: () => unknown }) =>
  fn(),
)
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags,
  withCache: vi.fn(async (_key: string, fn: () => unknown) => fn()),
  distributedLock: { runExclusive },
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
}))
const isCommunity = vi.fn(() => false)
vi.mock("../src/keys", () => ({ isCommunity }))
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "usage-1",
  }
})

const userQuotaService = {
  getForUser: vi.fn(async () => null as unknown),
}
vi.mock("../src/user-quota/service", () => ({ userQuotaService }))

const quotaEnforcementService = {
  tryConsume: vi.fn(async () => ({ ok: true })),
  release: vi.fn(async () => undefined),
}
vi.mock("../src/quota-enforcement/service", () => ({ quotaEnforcementService }))

const workspaceMemberService = {
  create: vi.fn(async () => undefined),
  listUserIdsByWorkspaceId: vi.fn(async () => [] as string[]),
}
const workspaceUsageService = {
  rollbackLiveIncrement: vi.fn(async () => undefined),
}
vi.mock("../src/workspace-usage/service", () => ({ workspaceUsageService }))

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService,
  workspaceMemberCacheTag: (userId: string) =>
    `users:${userId}:workspace-members`,
}))

const macRepository = {
  ensureWorkspaceMac: vi.fn(async () => new Map<string, string>()),
}
const anchoredPeriod = vi.fn(() => ({
  start: new Date("2026-05-01T00:00:00.000Z"),
  end: new Date("2026-06-01T00:00:00.000Z"),
}))
vi.mock("@chatbotx.io/analytics", () => ({ macRepository, anchoredPeriod }))

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
vi.mock("../src/logger", () => ({ logger }))

const dispatchAuditRecord = vi.fn()
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

const { workspaceService } = await import("../src/workspace/service")
const { compensateWorkspaceQuotaConsumption } = await import(
  "../src/workspace/quota-consumption"
)

function createInput() {
  return {
    data: { name: "WS", organizationId: "org-1" } as never,
    createdBy: "user-1",
  }
}

beforeEach(() => {
  returningWorkspace
    .mockReset()
    .mockResolvedValue([{ id: "ws-1", organizationId: "org-1" }])
  valuesWorkspace.mockClear()
  insert.mockClear()
  findFirstUser.mockReset().mockResolvedValue({ tenantId: "1" })
  findFirstWorkspace.mockReset().mockResolvedValue({ name: "Old Name" })
  tenantService.findByOwner.mockReset().mockResolvedValue(undefined)
  quotaEnforcementService.tryConsume.mockReset().mockResolvedValue({ ok: true })
  quotaEnforcementService.release.mockReset().mockResolvedValue(undefined)
  userQuotaService.getForUser.mockReset().mockResolvedValue(null)
  workspaceMemberService.create.mockClear()
  workspaceMemberService.listUserIdsByWorkspaceId
    .mockReset()
    .mockResolvedValue([])
  macRepository.ensureWorkspaceMac
    .mockReset()
    .mockResolvedValue(new Map<string, string>())
  anchoredPeriod.mockClear()
  logger.error.mockClear()
  dispatchAuditRecord.mockClear()
  transaction.mockClear()
  workspaceUsageService.rollbackLiveIncrement.mockClear()
  returningUpdatedWorkspace
    .mockReset()
    .mockResolvedValue([{ id: "ws-1", name: "New Name" }])
  setUpdate.mockClear()
  update.mockClear()
  invalidateCacheByTags.mockClear()
  isCommunity.mockReset().mockReturnValue(false)
  countWorkspaces.mockReset().mockResolvedValue(0)
  runExclusive
    .mockReset()
    .mockImplementation(async ({ fn }: { key: string; fn: () => unknown }) =>
      fn(),
    )
})

describe("WorkspaceService.create — MAC pre-provisioning", () => {
  test("creates WorkspaceMac when the user has a quota with periodStart", async () => {
    userQuotaService.getForUser.mockResolvedValue({
      id: "q-1",
      userId: "user-1",
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
    })

    await workspaceService.create(createInput())

    expect(anchoredPeriod).toHaveBeenCalledTimes(1)
    expect(macRepository.ensureWorkspaceMac).toHaveBeenCalledWith(
      [
        {
          workspaceId: "ws-1",
          periodStart: new Date("2026-05-01T00:00:00.000Z"),
          periodEnd: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
      db,
    )
  })

  test("skips MAC pre-provisioning when the user has no quota", async () => {
    userQuotaService.getForUser.mockResolvedValue(null)

    await workspaceService.create(createInput())

    expect(macRepository.ensureWorkspaceMac).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  test("skips MAC pre-provisioning when quota has no periodStart", async () => {
    userQuotaService.getForUser.mockResolvedValue({
      id: "q-1",
      userId: "user-1",
      periodStart: null,
    })

    await workspaceService.create(createInput())

    expect(macRepository.ensureWorkspaceMac).not.toHaveBeenCalled()
  })

  test("never blocks workspace creation if MAC provisioning throws", async () => {
    userQuotaService.getForUser.mockRejectedValue(new Error("db down"))

    const result = await workspaceService.create(createInput())

    expect(result).toEqual({ id: "ws-1", organizationId: "org-1" })
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(macRepository.ensureWorkspaceMac).not.toHaveBeenCalled()
  })

  test("logs and continues if ensureWorkspaceMac throws", async () => {
    userQuotaService.getForUser.mockResolvedValue({
      id: "q-1",
      userId: "user-1",
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
    })
    macRepository.ensureWorkspaceMac.mockRejectedValue(new Error("boom"))

    const result = await workspaceService.create(createInput())

    expect(result).toEqual({ id: "ws-1", organizationId: "org-1" })
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})

describe("WorkspaceService.create — happy path", () => {
  test("consumes only a workspace seat and creates the owner member", async () => {
    const result = await workspaceService.create(createInput())

    expect(result).toEqual({ id: "ws-1", organizationId: "org-1" })
    expect(quotaEnforcementService.tryConsume).toHaveBeenCalledOnce()
    expect(quotaEnforcementService.tryConsume).toHaveBeenCalledWith({
      userId: "user-1",
      metric: "workspaces",
    })
    expect(workspaceMemberService.create).toHaveBeenCalledTimes(1)
    const memberArg = workspaceMemberService.create.mock.calls[0][0]
    expect(memberArg.data.workspaceId).toBe("ws-1")
    expect(memberArg.data.role).toBe("owner")
  })

  test("does not consume a team-member seat for additional workspaces", async () => {
    await workspaceService.create(createInput())
    await workspaceService.create(createInput())

    expect(quotaEnforcementService.tryConsume).toHaveBeenCalledTimes(2)
    expect(quotaEnforcementService.tryConsume).toHaveBeenNthCalledWith(2, {
      userId: "user-1",
      metric: "workspaces",
    })
    expect(quotaEnforcementService.release).not.toHaveBeenCalled()
  })
})

describe("WorkspaceService.create — workspace seat compensation", () => {
  test("releases the consumed seat when the row insert fails", async () => {
    const insertError = new Error("insert failed")
    returningWorkspace.mockRejectedValueOnce(insertError)

    await expect(workspaceService.create(createInput())).rejects.toBe(
      insertError,
    )

    expect(quotaEnforcementService.tryConsume).toHaveBeenCalledOnce()
    expect(quotaEnforcementService.release).toHaveBeenCalledWith({
      userId: "user-1",
      metric: "workspaces",
    })
  })

  // Codex review (PR #1442): without a caller `tx` the row writes used to be
  // autocommitted, so a late failure (member insert) released the seat while
  // the Workspace row stayed behind — an under-count that lets the owner
  // exceed the plan limit. The writes must run in an owned transaction so the
  // row is gone before the seat is handed back.
  test("without a caller tx, a late failure rolls the row back in an owned transaction before releasing the seat", async () => {
    workspaceMemberService.create.mockRejectedValueOnce(
      new Error("member insert failed"),
    )

    await expect(workspaceService.create(createInput())).rejects.toThrow(
      "member insert failed",
    )

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(quotaEnforcementService.release).toHaveBeenCalledWith({
      userId: "user-1",
      metric: "workspaces",
    })
    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("undoes the live team-member counter when the workspace rolls back after its owner member was written", async () => {
    // The member insert bumped the Redis `teamMembers` counter for ws-1 and
    // wrote the usage row on the same tx; the tx then rolls back, so only the
    // Redis half is left to correct.
    macRepository.ensureWorkspaceMac.mockImplementationOnce(() => {
      throw new Error("mac rollup failed hard")
    })
    invalidateCacheByTags.mockRejectedValueOnce(new Error("redis down"))

    await expect(workspaceService.create(createInput())).rejects.toThrow(
      "redis down",
    )

    expect(workspaceUsageService.rollbackLiveIncrement).toHaveBeenCalledWith(
      "ws-1",
      "teamMembers",
    )
  })

  test("leaves the live team-member counter alone when the create succeeds", async () => {
    await workspaceService.create(createInput())

    expect(workspaceUsageService.rollbackLiveIncrement).not.toHaveBeenCalled()
  })

  test("with a caller tx, never opens its own transaction", async () => {
    // No MAC period on the quota row, so the MAC savepoint is skipped too.
    await workspaceService.create({ ...createInput(), tx: db as never })

    expect(transaction).not.toHaveBeenCalled()
  })

  // Codex review (PR #1442): `ensureMacRollup` swallows its error on purpose
  // (MAC pre-provisioning must never block creation), but a failed statement
  // on the owning transaction leaves Postgres' transaction aborted — COMMIT
  // then silently becomes ROLLBACK while `create` reports success. Run the
  // optional write behind a SAVEPOINT so only it rolls back.
  test("runs the MAC pre-provisioning behind a savepoint so its SQL failure leaves the owning transaction usable", async () => {
    userQuotaService.getForUser.mockResolvedValue({
      id: "q-1",
      userId: "user-1",
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
    })
    macRepository.ensureWorkspaceMac.mockRejectedValueOnce(
      new Error("mac insert failed"),
    )

    const result = await workspaceService.create(createInput())

    expect(result).toEqual({ id: "ws-1", organizationId: "org-1" })
    // Owned transaction + the MAC savepoint.
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(quotaEnforcementService.release).not.toHaveBeenCalled()
    expect(dispatchAuditRecord).toHaveBeenCalledTimes(1)
  })

  test("marks the caller's tracker consumed only once the row is written", async () => {
    const quotaConsumption = { consumed: false as const }

    await workspaceService.create({
      ...createInput(),
      tx: db as never,
      quotaConsumption,
    })

    expect(quotaConsumption).toEqual({
      consumed: true,
      userId: "user-1",
      workspaceId: "ws-1",
    })
  })

  test("leaves the tracker untouched when create owned the transaction (nothing is left for the caller to undo)", async () => {
    const quotaConsumption = { consumed: false as const }

    await workspaceService.create({ ...createInput(), quotaConsumption })

    expect(quotaConsumption).toEqual({ consumed: false })
  })

  test("leaves the caller's tracker untouched when the insert fails (the seat was already released here)", async () => {
    returningWorkspace.mockRejectedValueOnce(new Error("insert failed"))
    const quotaConsumption = { consumed: false as const }

    await expect(
      workspaceService.create({ ...createInput(), quotaConsumption }),
    ).rejects.toThrow("insert failed")

    expect(quotaConsumption).toEqual({ consumed: false })
  })

  test("compensateWorkspaceQuotaConsumption releases the seat and the live owner-member counter once, then resets the tracker", async () => {
    const quotaConsumption = {
      consumed: true as const,
      userId: "user-1",
      workspaceId: "ws-1",
    }

    await compensateWorkspaceQuotaConsumption(quotaConsumption)
    await compensateWorkspaceQuotaConsumption(quotaConsumption)

    expect(quotaEnforcementService.release).toHaveBeenCalledTimes(1)
    expect(quotaEnforcementService.release).toHaveBeenCalledWith({
      userId: "user-1",
      metric: "workspaces",
    })
    // Codex review (PR #1442): the owner-member insert bumped the live
    // `teamMembers` counter inside the caller's transaction; when that
    // transaction rolls back after `create` returned, only this compensation
    // can still undo the Redis half (the durable row went with the tx).
    expect(workspaceUsageService.rollbackLiveIncrement).toHaveBeenCalledTimes(1)
    expect(workspaceUsageService.rollbackLiveIncrement).toHaveBeenCalledWith(
      "ws-1",
      "teamMembers",
    )
    expect(quotaConsumption).toEqual({ consumed: false })
  })

  test("compensateWorkspaceQuotaConsumption is a no-op for an unconsumed tracker", async () => {
    await compensateWorkspaceQuotaConsumption({ consumed: false })

    expect(quotaEnforcementService.release).not.toHaveBeenCalled()
  })
})

describe("WorkspaceService.create — community workspace limit", () => {
  test("creates the first workspace under the distributed lock", async () => {
    isCommunity.mockReturnValue(true)
    countWorkspaces.mockResolvedValue(0)

    const result = await workspaceService.create(createInput())

    expect(result).toEqual({ id: "ws-1", organizationId: "org-1" })
    expect(runExclusive).toHaveBeenCalledTimes(1)
    expect(runExclusive.mock.calls[0][0].key).toBe("workspace-limit:user-1")
    expect(countWorkspaces).toHaveBeenCalledTimes(1)
  })

  test("throws workspaceLimitReached for the second workspace", async () => {
    isCommunity.mockReturnValue(true)
    countWorkspaces.mockResolvedValue(1)

    await expect(workspaceService.create(createInput())).rejects.toMatchObject({
      code: "workspaceLimitReached",
    })
    expect(insert).not.toHaveBeenCalled()
    expect(quotaEnforcementService.tryConsume).not.toHaveBeenCalled()
  })

  test("keys the lock on data.ownerId when it differs from createdBy", async () => {
    isCommunity.mockReturnValue(true)
    countWorkspaces.mockResolvedValue(0)

    await workspaceService.create({
      data: { name: "WS", ownerId: "owner-9" } as never,
      createdBy: "user-1",
    })

    expect(runExclusive.mock.calls[0][0].key).toBe("workspace-limit:owner-9")
  })

  test("skips the limit entirely off community", async () => {
    isCommunity.mockReturnValue(false)

    await workspaceService.create(createInput())
    await workspaceService.create(createInput())

    expect(runExclusive).not.toHaveBeenCalled()
    expect(countWorkspaces).not.toHaveBeenCalled()
    expect(quotaEnforcementService.tryConsume).toHaveBeenCalledTimes(2)
  })
})

describe("WorkspaceService.findActiveByOwner", () => {
  test("excludes a workspace mid soft-delete and orders deterministically by id", async () => {
    findFirstWorkspace.mockResolvedValueOnce({ id: "ws-1" })

    const result = await workspaceService.findActiveByOwner({
      ownerId: "owner-1",
    })

    expect(result).toEqual({ id: "ws-1" })
    expect(findFirstWorkspace).toHaveBeenCalledWith({
      where: { ownerId: "owner-1", scheduledDeletionAt: { isNull: true } },
      orderBy: { id: "asc" },
    })
  })

  test("returns undefined when the owner's only workspace is scheduled for deletion", async () => {
    findFirstWorkspace.mockResolvedValueOnce(undefined)

    await expect(
      workspaceService.findActiveByOwner({ ownerId: "owner-1" }),
    ).resolves.toBeUndefined()
  })
})

describe("WorkspaceService.update — member cache invalidation", () => {
  test("invalidates the workspace tag and every member's workspace-members tag", async () => {
    workspaceMemberService.listUserIdsByWorkspaceId.mockResolvedValue([
      "user-1",
      "user-2",
    ])

    const result = await workspaceService.update({
      id: "ws-1",
      data: { name: "New Name" },
    })

    expect(result).toEqual({ id: "ws-1", name: "New Name" })
    expect(
      workspaceMemberService.listUserIdsByWorkspaceId,
    ).toHaveBeenCalledWith({ tx: db, workspaceId: "ws-1" })
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-1",
      "users:user-1:workspace-members",
      "users:user-2:workspace-members",
    ])
  })

  test("invalidates only the workspace tag when the workspace has no members", async () => {
    workspaceMemberService.listUserIdsByWorkspaceId.mockResolvedValue([])

    await workspaceService.update({ id: "ws-1", data: { name: "New Name" } })

    expect(invalidateCacheByTags).toHaveBeenCalledWith(["workspaces:ws-1"])
  })

  test("rejects cancellation after the durable purge fence is set", async () => {
    returningUpdatedWorkspace.mockResolvedValueOnce([])

    await expect(
      workspaceService.cancelDeletion({ id: "ws-1" }),
    ).rejects.toMatchObject({
      code: "workspaceDeletionStarted",
    })
  })
})

// Token-creation auditing moved with the write: see
// workspace-api-token.service.test.ts (workspaceApiTokenService.createToken).

describe("workspaceService.updateSettings", () => {
  test("writes only the five settings columns, whatever else is passed", async () => {
    setUpdate.mockClear()

    await workspaceService.updateSettings({
      id: "ws-1",
      data: {
        defaultReply: "11",
        defaultReplyFrequency: "oncePerDay",
        smartResponseDelaySeconds: 10,
        capiLimitedDataUse: true,
        logo: "https://cdn.example.com/l.png",
        // Not settings: must never reach the UPDATE.
        status: "suspended",
        ownerId: "attacker",
        tenantId: "9",
      } as never,
    })

    expect(setUpdate).toHaveBeenCalledWith({
      defaultReply: "11",
      defaultReplyFrequency: "oncePerDay",
      smartResponseDelaySeconds: 10,
      capiLimitedDataUse: true,
      logo: "https://cdn.example.com/l.png",
    })
  })

  test("a Default Reply flow of another workspace is refused and nothing is written", async () => {
    setUpdate.mockClear()
    findFirstFlow.mockResolvedValueOnce(undefined as never)

    await expect(
      workspaceService.updateSettings({
        id: "ws-1",
        data: { defaultReply: "99" },
      }),
    ).rejects.toThrow("Flow not found")
    expect(setUpdate).not.toHaveBeenCalled()
  })

  test("clearing the Default Reply (null) needs no flow lookup", async () => {
    setUpdate.mockClear()
    findFirstFlow.mockClear()

    await workspaceService.updateSettings({
      id: "ws-1",
      data: { defaultReply: null },
    })

    expect(findFirstFlow).not.toHaveBeenCalled()
    expect(setUpdate).toHaveBeenCalledWith({ defaultReply: null })
  })

  test("an empty or all-undefined body writes nothing and returns the workspace", async () => {
    setUpdate.mockClear()
    findFirstWorkspace.mockResolvedValueOnce({
      id: "ws-1",
      name: "Old",
    } as never)

    const result = await workspaceService.updateSettings({
      id: "ws-1",
      data: { logo: undefined },
    })

    expect(setUpdate).not.toHaveBeenCalled()
    expect(result).toMatchObject({ id: "ws-1" })
  })

  test("a field left out is not written (undefined is skipped)", async () => {
    setUpdate.mockClear()

    await workspaceService.updateSettings({
      id: "ws-1",
      data: { capiLimitedDataUse: false },
    })

    expect(setUpdate).toHaveBeenCalledWith({ capiLimitedDataUse: false })
  })
})
