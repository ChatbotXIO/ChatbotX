import { beforeEach, describe, expect, test, vi } from "vitest"
import { ChatbotXException } from "../../errors"

const mocks = vi.hoisted(() => ({
  workspaceInsert: vi.fn(),
  workspaceInsertValues: vi.fn(),
  tryConsume: vi.fn(),
  createMember: vi.fn(),
  getForUser: vi.fn(),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  anchoredPeriod: vi.fn(() => ({ start: new Date(), end: new Date() })),
  macRepository: { ensureWorkspaceMac: vi.fn(async () => undefined) },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { userModel: { findFirst: vi.fn(async () => undefined) } },
    insert: mocks.workspaceInsert,
  },
  eq: vi.fn((column, value) => ({ column, value })),
  inArray: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  workspaceMemberRoles: { enum: { owner: "owner" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  workspaceMemberModel: {},
  workspaceModel: {},
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(async (_key: string, resolver: () => unknown) => resolver()),
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("../../enterprise/tenant/service", () => ({
  tenantService: { findByOwner: vi.fn(async () => undefined) },
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
    purgeWorkspaceHeavyData: vi.fn(async () => undefined),
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
  mocks.workspaceInsert.mockReset()
  mocks.workspaceInsertValues.mockReset()
  mocks.tryConsume.mockReset()
  mocks.createMember.mockReset()
  mocks.createMember.mockResolvedValue(undefined)
  mocks.getForUser.mockReset()
  mocks.getForUser.mockResolvedValue(undefined)
  mocks.invalidateCacheByTags.mockReset()

  mocks.workspaceInsert.mockReturnValue({
    values: mocks.workspaceInsertValues.mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "new-workspace" }]),
    }),
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
