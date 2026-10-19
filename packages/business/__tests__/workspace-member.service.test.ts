import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const deleteWhere = vi.fn()
  return {
    decrement: vi.fn(),
    increment: vi.fn(async () => undefined),
    insertReturning: vi.fn(async () => [{ id: "member-1" }]),
    deleteWhere,
    dispatchAuditRecord: vi.fn(),
    findFirst: vi.fn(),
    listPermissionsByUserIds: vi.fn(),
    markOnlineBulk: vi.fn(),
    deleteMembersForUsers: vi.fn(async () => undefined),
    order: [] as string[],
    txClient: { delete: () => ({ where: async () => undefined }) },
    invalidateCacheByTags: vi.fn(async () => undefined),
  }
})

const makeClient = () => ({
  query: {
    workspaceMemberModel: { findFirst: mocks.findFirst },
  },
  insert: vi.fn(() => ({
    values: vi.fn(() => ({ returning: mocks.insertReturning })),
  })),
  delete: vi.fn(() => ({ where: mocks.deleteWhere })),
  transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => {
    mocks.order.push("begin")
    const result = await fn(mocks.txClient)
    mocks.order.push("commit")
    return result
  }),
})

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/workspace-usage/service", () => ({
  workspaceUsageService: {
    decrement: mocks.decrement,
    increment: mocks.increment,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  db: makeClient(),
  eq: (...args: unknown[]) => ({ eq: args }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  workspaceMemberRoles: { enum: { owner: "owner" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceMemberModel: {
    id: "workspaceMember.id",
    workspaceId: "workspaceMember.workspaceId",
  },
}))

vi.mock("../src/working-hours/service", () => ({
  workingHoursService: { removeMembersForUsers: mocks.deleteMembersForUsers },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  workspaceMemberRepository: {
    listPermissionsByUserIds: mocks.listPermissionsByUserIds,
    markOnlineBulk: mocks.markOnlineBulk,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(),
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

const { workspaceMemberDeleteCacheTags, workspaceMemberService } = await import(
  "../src/workspace-member/service"
)

describe("workspaceMemberDeleteCacheTags", () => {
  test("lists the schedule, roster and user tags a removal makes stale", () => {
    expect(workspaceMemberDeleteCacheTags("ws-1", "user-1")).toEqual([
      "working-hours:ws-1",
      "workspaces:ws-1:workspace-members",
      "users:user-1:workspace-members",
    ])
  })

  test("omits the user tag when the member did not exist", () => {
    expect(workspaceMemberDeleteCacheTags("ws-1", undefined)).toEqual([
      "working-hours:ws-1",
      "workspaces:ws-1:workspace-members",
    ])
  })
})

describe("workspaceMemberService.create", () => {
  beforeEach(() => {
    mocks.increment.mockClear()
  })

  // Codex review (PR #1442): the team-member usage row must ride the same
  // transaction as the member insert. `workspaceService.create` now wraps its
  // writes in a transaction, so a global-db write here cannot see the new
  // Workspace row and trips the WorkspaceUsage FK — swallowed, leaving a
  // brand-new workspace reporting zero members.
  test("writes the team-member usage increment through the caller's tx", async () => {
    const tx = makeClient()

    await workspaceMemberService.create({
      tx: tx as never,
      data: { userId: "user-1", workspaceId: "ws-1", role: "owner" } as never,
    })

    expect(mocks.increment).toHaveBeenCalledWith("ws-1", "teamMembers", 1, tx)
  })

  // Codex review (PR #1442): a failed statement on a supplied Postgres tx
  // leaves that transaction aborted; swallowing the error would let the next
  // statement (or COMMIT) fail while this call reports success. Let the
  // transaction owner see it, roll back and compensate.
  test("reports on the caller's tracker whether the live team-member counter took the increment", async () => {
    const tx = makeClient()
    const teamMemberUsage = { liveIncremented: false }
    mocks.increment.mockResolvedValueOnce(true as never)

    await workspaceMemberService.create({
      tx: tx as never,
      data: { userId: "user-1", workspaceId: "ws-1", role: "owner" } as never,
      teamMemberUsage,
    })

    expect(teamMemberUsage).toEqual({ liveIncremented: true })
  })

  test("propagates a usage-increment failure when writing on the caller's tx", async () => {
    const tx = makeClient()
    const failure = new Error("usage upsert failed")
    mocks.increment.mockRejectedValueOnce(failure)

    await expect(
      workspaceMemberService.create({
        tx: tx as never,
        data: { userId: "user-1", workspaceId: "ws-1", role: "owner" } as never,
      }),
    ).rejects.toBe(failure)
  })

  test("stays best-effort for the usage increment when no tx is given", async () => {
    mocks.increment.mockRejectedValueOnce(new Error("usage upsert failed"))

    await expect(
      workspaceMemberService.create({
        data: { userId: "user-1", workspaceId: "ws-1", role: "owner" } as never,
      }),
    ).resolves.toEqual({ id: "member-1" })
  })

  test("falls back to the global db for the usage increment when no tx is given", async () => {
    await workspaceMemberService.create({
      data: { userId: "user-1", workspaceId: "ws-1", role: "owner" } as never,
    })

    expect(mocks.increment).toHaveBeenCalledWith("ws-1", "teamMembers")
  })
})

describe("workspaceMemberService.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.decrement.mockResolvedValue(undefined)
    mocks.findFirst.mockResolvedValue({
      id: "member-1",
      userId: "user-1",
      user: { name: "Ada", email: "ada@example.com" },
    })
  })

  test("on a caller tx, deletes the schedule row on that tx and leaves invalidation to the caller", async () => {
    const tx = makeClient()

    await workspaceMemberService.delete({
      id: "member-1",
      workspaceId: "workspace-1",
      tx: tx as never,
    })

    expect(mocks.deleteMembersForUsers).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userIds: ["user-1"],
      tx,
    })
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("without a tx, deletes member and schedule row in one transaction and invalidates after commit", async () => {
    mocks.order.length = 0
    mocks.invalidateCacheByTags.mockImplementationOnce(() => {
      mocks.order.push("invalidate")
      return Promise.resolve()
    })

    await workspaceMemberService.delete({
      id: "member-1",
      workspaceId: "workspace-1",
    })

    expect(mocks.deleteMembersForUsers).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userIds: ["user-1"],
      tx: mocks.txClient,
    })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "working-hours:workspace-1",
      "workspaces:workspace-1:workspace-members",
      "users:user-1:workspace-members",
    ])
    expect(mocks.order).toEqual(["begin", "commit", "invalidate"])
  })

  test("skips the working-hours cleanup when the member does not exist", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await workspaceMemberService.delete({
      id: "missing",
      workspaceId: "workspace-1",
    })

    expect(mocks.deleteMembersForUsers).not.toHaveBeenCalled()
  })

  test("does not audit inside a caller-owned transaction", async () => {
    await workspaceMemberService.delete({
      id: "member-1",
      workspaceId: "workspace-1",
      tx: makeClient() as never,
    })

    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("audits normal non-transaction deletes", async () => {
    await workspaceMemberService.delete({
      id: "member-1",
      workspaceId: "workspace-1",
    })

    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith({
      action: "delete",
      detail: "removed Ada from workspace",
    })
  })
})

// Pins the ring-target read as a pure delegation to the repository —
// no caching, no transformation — so a future change to either layer can't
// silently drift without a failing test here.
describe("workspaceMemberService.listPermissionsByUserIds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates straight to workspaceMemberRepository.listPermissionsByUserIds with the same props and returns its result unchanged", async () => {
    const rows = [{ userId: "u1", permissions: { contacts: true } }]
    mocks.listPermissionsByUserIds.mockResolvedValue(rows)

    const result = await workspaceMemberService.listPermissionsByUserIds({
      workspaceId: "ws-1",
      userIds: ["u1", "u2"],
    })

    expect(mocks.listPermissionsByUserIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userIds: ["u1", "u2"],
    })
    expect(mocks.listPermissionsByUserIds).toHaveBeenCalledTimes(1)
    expect(result).toBe(rows)
  })
})

describe("workspaceMemberService.markOnlineBulk", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates straight to workspaceMemberRepository.markOnlineBulk", async () => {
    mocks.markOnlineBulk.mockResolvedValue(undefined)

    await workspaceMemberService.markOnlineBulk({
      workspaceId: "ws-1",
      userIds: ["u1", "u2"],
    })

    expect(mocks.markOnlineBulk).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userIds: ["u1", "u2"],
    })
  })
})
