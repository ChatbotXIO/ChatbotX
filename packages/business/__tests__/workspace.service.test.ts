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
const countWorkspaces = vi.fn(async () => 0)
const db = {
  insert,
  update,
  $count: countWorkspaces,
  query: { userModel: { findFirst: findFirstUser } },
}
vi.mock("@chatbotx.io/database/client", () => ({
  db,
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceModel: {},
  workspaceUsageModel: { workspaceId: "workspaceId-column" },
  ROOT_TENANT_ID: "1",
}))

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

const { workspaceService } = await import("../src/workspace/service")

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
})
