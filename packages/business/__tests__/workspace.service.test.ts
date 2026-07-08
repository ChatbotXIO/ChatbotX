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
const db = {
  insert,
  update,
  query: { userModel: { findFirst: findFirstUser } },
}
vi.mock("@chatbotx.io/database/client", () => ({
  db,
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceModel: {},
  ROOT_TENANT_ID: "1",
}))

const tenantService = { findByOwner: vi.fn(async () => undefined as unknown) }
vi.mock("../src/enterprise/tenant/service", () => ({ tenantService }))
vi.mock("@chatbotx.io/database/partials", () => ({
  workspaceMemberRoles: { enum: { owner: "owner" } },
}))
const invalidateCacheByTags = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags,
  withCache: vi.fn(async (_key: string, fn: () => unknown) => fn()),
}))
vi.mock("@chatbotx.io/utils", () => ({ createId: () => "usage-1" }))

const userQuotaService = {
  getForUser: vi.fn(async () => null as unknown),
}
vi.mock("../src/user-quota/service", () => ({ userQuotaService }))

const quotaEnforcementService = {
  tryConsume: vi.fn(async () => ({ ok: true })),
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
  test("returns the newly inserted workspace and creates the owner member", async () => {
    const result = await workspaceService.create(createInput())

    expect(result).toEqual({ id: "ws-1", organizationId: "org-1" })
    expect(workspaceMemberService.create).toHaveBeenCalledTimes(1)
    const memberArg = workspaceMemberService.create.mock.calls[0][0]
    expect(memberArg.data.workspaceId).toBe("ws-1")
    expect(memberArg.data.role).toBe("owner")
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
