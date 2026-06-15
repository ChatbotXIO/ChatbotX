import { beforeEach, describe, expect, test, vi } from "vitest"

const returningWorkspace = vi.fn(async () => [
  { id: "ws-1", organizationId: "org-1" },
])
const valuesWorkspace = vi.fn(() => ({ returning: returningWorkspace }))
const insert = vi.fn(() => ({ values: valuesWorkspace }))

const findFirstUser = vi.fn(async () => ({ tenantId: "1" }))
const db = { insert, query: { userModel: { findFirst: findFirstUser } } }
vi.mock("@chatbotx.io/database/client", () => ({ db }))
vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceModel: {},
  ROOT_TENANT_ID: "1",
}))

const tenantService = { findByOwner: vi.fn(async () => undefined as unknown) }
vi.mock("../src/enterprise/tenant/service", () => ({ tenantService }))
vi.mock("@chatbotx.io/database/partials", () => ({
  workspaceMemberRoles: { enum: { owner: "owner" } },
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(async () => undefined),
  withCache: vi.fn(async (_key: string, fn: () => unknown) => fn()),
}))
vi.mock("@chatbotx.io/utils", () => ({ createId: () => "usage-1" }))

const userQuotaService = {
  tryIncrement: vi.fn(async () => true),
  getForUser: vi.fn(async () => null as unknown),
}
vi.mock("../src/user-quota/service", () => ({ userQuotaService }))

const workspaceMemberService = {
  create: vi.fn(async () => undefined),
}
vi.mock("../src/workspace-member/service", () => ({ workspaceMemberService }))

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
  userQuotaService.tryIncrement.mockReset().mockResolvedValue(true)
  userQuotaService.getForUser.mockReset().mockResolvedValue(null)
  workspaceMemberService.create.mockClear()
  macRepository.ensureWorkspaceMac
    .mockReset()
    .mockResolvedValue(new Map<string, string>())
  anchoredPeriod.mockClear()
  logger.error.mockClear()
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
