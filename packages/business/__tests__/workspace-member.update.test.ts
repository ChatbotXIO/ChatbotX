import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updateReturning: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  update: vi.fn(),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  db: {
    update: mocks.update,
  },
  eq: (...args: unknown[]) => ({ eq: args }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  workspaceMemberRoles: { enum: { owner: "owner" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceMemberModel: {
    id: "workspaceMember.id",
    workspaceId: "workspaceMember.workspaceId",
    userId: "workspaceMember.userId",
  },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(() => ({ limit: 10, offset: 0 })),
  likeContains: (value: string) => `%${value}%`,
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(),
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(),
}))

vi.mock("../src/workspace-usage/service", () => ({
  workspaceUsageService: { increment: vi.fn(), decrement: vi.fn() },
}))

const { workspaceMemberService, workspaceMemberCacheTag } = await import(
  "../src/workspace-member/service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.update.mockReturnValue({ set: mocks.updateSet })
  mocks.updateSet.mockReturnValue({
    where: mocks.updateWhere,
  })
  mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning })
})

describe("workspaceMemberService.update", () => {
  test("returns undefined and skips invalidation when zero rows are updated", async () => {
    mocks.updateReturning.mockResolvedValue([])

    const result = await workspaceMemberService.update({
      id: "member-1",
      workspaceId: "ws-1",
      data: { permissions: { superAdmin: true } },
    })

    expect(result).toBeUndefined()
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("invalidates the user's workspace-members cache tag on success", async () => {
    mocks.updateReturning.mockResolvedValue([
      { id: "member-1", userId: "user-1" },
    ])

    const result = await workspaceMemberService.update({
      id: "member-1",
      workspaceId: "ws-1",
      data: { permissions: { superAdmin: true } },
    })

    expect(result).toEqual({ id: "member-1" })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      workspaceMemberCacheTag("user-1"),
    ])
  })

  // Defense-in-depth: today's only caller pre-validates via
  // `findByIdOrFail({ id, workspaceId })`, so this is not a live
  // cross-workspace bug, but the method's own signature advertises workspace
  // scoping — the WHERE clause must actually enforce it so a future caller
  // that skips the pre-check can't update another workspace's member row.
  test("scopes the update to both the member id and the workspace", async () => {
    mocks.updateReturning.mockResolvedValue([
      { id: "member-1", userId: "user-1" },
    ])

    await workspaceMemberService.update({
      id: "member-1",
      workspaceId: "ws-1",
      data: { permissions: { superAdmin: true } },
    })

    expect(mocks.updateWhere).toHaveBeenCalledWith({
      and: [
        { eq: ["workspaceMember.id", "member-1"] },
        { eq: ["workspaceMember.workspaceId", "ws-1"] },
      ],
    })
  })
})
