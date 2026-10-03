import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  deleteReturning: vi.fn(),
  deleteWhere: vi.fn(),
  listExistingUserIds: vi.fn(),
  insertValues: vi.fn(),
  teamFindFirst: vi.fn(),
  teamFindMany: vi.fn(),
  teamMemberFindMany: vi.fn(),
  userFindMany: vi.fn(),
  listUserIdsByTeamId: vi.fn(),
  dispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
  tryRevokeWorkspaceMemberRealtimeConnections: vi.fn().mockResolvedValue(true),
}))

const WORKSPACE_ID = "ws-1"
const TEAM_ID = "team-1"

// `db.transaction` hands the callback a `tx` that records every insert's
// payload, so these tests can assert on what would actually be written.
const makeTx = () => ({
  insert: (_table: unknown) => ({
    values: (values: unknown) => {
      mocks.insertValues(values)
      const result = Promise.resolve([]) as Promise<unknown[]> & {
        returning: () => Promise<unknown[]>
      }
      result.returning = () =>
        Promise.resolve([
          { id: TEAM_ID, workspaceId: WORKSPACE_ID, name: "Support" },
        ])
      return result
    },
  }),
  query: {
    inboxTeamMemberModel: { findMany: mocks.teamMemberFindMany },
    userModel: { findMany: mocks.userFindMany },
  },
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: mocks.delete,
    query: {
      inboxTeamModel: {
        findFirst: mocks.teamFindFirst,
        findMany: mocks.teamFindMany,
      },
      inboxTeamMemberModel: { findMany: mocks.teamMemberFindMany },
    },
    transaction: (fn: (tx: unknown) => unknown) => fn(makeTx()),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
}))

// Plain object stubs only — importing the real schema opens a database
// connection through the sharding client.
vi.mock("@chatbotx.io/database/schema", () => ({
  inboxTeamModel: {},
  inboxTeamMemberModel: {},
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  inboxTeamMemberRepository: {
    listUserIdsByTeamId: mocks.listUserIdsByTeamId,
  },
}))

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: { listExistingUserIds: mocks.listExistingUserIds },
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  tryRevokeWorkspaceMemberRealtimeConnections:
    mocks.tryRevokeWorkspaceMemberRealtimeConnections,
}))

const { inboxTeamService } = await import(
  "../src/enterprise/inbox-team/service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.teamFindFirst.mockResolvedValue({
    id: TEAM_ID,
    workspaceId: WORKSPACE_ID,
    name: "Support",
  })
  mocks.teamMemberFindMany.mockResolvedValue([])
  mocks.userFindMany.mockResolvedValue([])
  mocks.delete.mockReturnValue({ where: mocks.deleteWhere })
  mocks.deleteWhere.mockReturnValue({ returning: mocks.deleteReturning })
  mocks.deleteReturning.mockResolvedValue([{ id: "member-row-1" }])
  mocks.teamFindMany.mockResolvedValue([{ id: TEAM_ID }])
  mocks.listUserIdsByTeamId.mockResolvedValue(["member-1"])
})

describe("InboxTeamService member validation against duplicate membership rows", () => {
  // `WorkspaceMember` has no unique constraint on (workspaceId, userId), so
  // `listExistingUserIds` can return two rows for one user. Counting raw rows
  // instead of distinct userIds lets a duplicate row stand in for a user who
  // isn't a member at all.
  test("create rejects a non-member even when a duplicate row pads the count", async () => {
    mocks.listExistingUserIds.mockResolvedValue([
      { userId: "member-1" },
      { userId: "member-1" },
    ])

    await expect(
      inboxTeamService.create({
        workspaceId: WORKSPACE_ID,
        data: { name: "Support", userIds: ["member-1", "outsider-1"] },
      }),
    ).rejects.toMatchObject({
      code: "invalidTeamMember",
      httpStatusCode: 400,
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
  })

  test("create accepts every userId being a member even when the DB returns duplicate rows", async () => {
    mocks.listExistingUserIds.mockResolvedValue([
      { userId: "member-1" },
      { userId: "member-1" },
      { userId: "member-2" },
    ])

    await expect(
      inboxTeamService.create({
        workspaceId: WORKSPACE_ID,
        data: { name: "Support", userIds: ["member-1", "member-2"] },
      }),
    ).resolves.toBeDefined()
    expect(
      mocks.tryRevokeWorkspaceMemberRealtimeConnections,
    ).toHaveBeenCalledTimes(2)
    expect(
      mocks.tryRevokeWorkspaceMemberRealtimeConnections,
    ).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      userId: "member-1",
      reason: "reauth",
      errorMessage: "Failed to revoke inbox team member realtime connections",
    })
    expect(
      mocks.tryRevokeWorkspaceMemberRealtimeConnections,
    ).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      userId: "member-2",
      reason: "reauth",
      errorMessage: "Failed to revoke inbox team member realtime connections",
    })
  })

  test("still audits a created team when realtime revocation reports a warning", async () => {
    mocks.listExistingUserIds.mockResolvedValue([{ userId: "member-1" }])
    mocks.tryRevokeWorkspaceMemberRealtimeConnections.mockResolvedValueOnce(
      false,
    )

    await expect(
      inboxTeamService.create({
        workspaceId: WORKSPACE_ID,
        data: { name: "Support", userIds: ["member-1"] },
      }),
    ).resolves.toMatchObject({ id: TEAM_ID })

    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create" }),
    )
  })

  test("addMembers rejects a non-member even when a duplicate row pads the count", async () => {
    mocks.listExistingUserIds.mockResolvedValue([
      { userId: "member-1" },
      { userId: "member-1" },
    ])

    await expect(
      inboxTeamService.addMembers(
        { workspaceId: WORKSPACE_ID, inboxTeamId: TEAM_ID },
        ["member-1", "outsider-1"],
      ),
    ).rejects.toMatchObject({
      code: "invalidTeamMember",
      httpStatusCode: 400,
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
  })
})

describe("InboxTeamService membership inserts", () => {
  // `InboxTeamMember` has no `workspaceId` column — tenant isolation is
  // transitive via `inboxTeamId -> InboxTeam.workspaceId`. Drizzle silently
  // drops an unknown key and `tsc` misses it through `.map()`, so pin the
  // written shape here.
  test("create writes only columns that exist on InboxTeamMember", async () => {
    mocks.listExistingUserIds.mockResolvedValue([{ userId: "member-1" }])

    await inboxTeamService.create({
      workspaceId: WORKSPACE_ID,
      data: { name: "Support", userIds: ["member-1"] },
    })

    const memberRows = mocks.insertValues.mock.calls
      .map(([values]) => values)
      .find((values) => Array.isArray(values)) as
      | Record<string, unknown>[]
      | undefined

    expect(memberRows).toBeDefined()
    expect(Object.keys(memberRows?.[0] ?? {}).sort()).toEqual([
      "id",
      "inboxTeamId",
      "userId",
    ])
  })

  test("addMembers writes only columns that exist on InboxTeamMember", async () => {
    mocks.listExistingUserIds.mockResolvedValue([{ userId: "member-1" }])

    await inboxTeamService.addMembers(
      { workspaceId: WORKSPACE_ID, inboxTeamId: TEAM_ID },
      ["member-1"],
    )

    const memberRows = mocks.insertValues.mock.calls
      .map(([values]) => values)
      .find((values) => Array.isArray(values)) as
      | Record<string, unknown>[]
      | undefined

    expect(memberRows).toBeDefined()
    expect(Object.keys(memberRows?.[0] ?? {}).sort()).toEqual([
      "id",
      "inboxTeamId",
      "userId",
    ])
  })
})

// Pins listUserIdsByTeamId as a pure delegation to the repository — no
// caching, no transformation.
describe("InboxTeamService.listUserIdsByTeamId", () => {
  test("delegates straight to inboxTeamMemberRepository.listUserIdsByTeamId with the same props and returns its result unchanged", async () => {
    const userIds = ["u1", "u2"]
    mocks.listUserIdsByTeamId.mockResolvedValue(userIds)

    const result = await inboxTeamService.listUserIdsByTeamId({
      workspaceId: WORKSPACE_ID,
      inboxTeamId: TEAM_ID,
    })

    expect(mocks.listUserIdsByTeamId).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      inboxTeamId: TEAM_ID,
    })
    expect(mocks.listUserIdsByTeamId).toHaveBeenCalledTimes(1)
    expect(result).toBe(userIds)
  })
})

describe("InboxTeamService membership mutation revocation", () => {
  test("revokes members affected by team deletion", async () => {
    await inboxTeamService.delete({ workspaceId: WORKSPACE_ID, ids: [TEAM_ID] })

    expect(
      mocks.tryRevokeWorkspaceMemberRealtimeConnections,
    ).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      userId: "member-1",
      reason: "reauth",
      errorMessage: "Failed to revoke inbox team member realtime connections",
    })
  })

  test("deduplicates multi-team members and continues revocations after one failure", async () => {
    mocks.teamFindMany.mockResolvedValue([{ id: TEAM_ID }, { id: "team-2" }])
    mocks.listUserIdsByTeamId
      .mockResolvedValueOnce(["member-1", "member-2"])
      .mockResolvedValueOnce(["member-1", "member-3"])
    mocks.tryRevokeWorkspaceMemberRealtimeConnections
      .mockRejectedValueOnce(new Error("Redis unavailable"))
      .mockResolvedValue(true)

    await expect(
      inboxTeamService.delete({
        workspaceId: WORKSPACE_ID,
        ids: [TEAM_ID, "team-2"],
      }),
    ).resolves.toBeUndefined()

    expect(
      mocks.tryRevokeWorkspaceMemberRealtimeConnections,
    ).toHaveBeenCalledTimes(3)
    expect(
      mocks.tryRevokeWorkspaceMemberRealtimeConnections,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "member-1",
        workspaceId: WORKSPACE_ID,
      }),
    )
    expect(
      mocks.tryRevokeWorkspaceMemberRealtimeConnections,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "member-2",
        workspaceId: WORKSPACE_ID,
      }),
    )
    expect(
      mocks.tryRevokeWorkspaceMemberRealtimeConnections,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "member-3",
        workspaceId: WORKSPACE_ID,
      }),
    )
  })

  test("revokes newly added members", async () => {
    mocks.listExistingUserIds.mockResolvedValue([{ userId: "member-1" }])

    await inboxTeamService.addMembers(
      { workspaceId: WORKSPACE_ID, inboxTeamId: TEAM_ID },
      ["member-1"],
    )

    expect(
      mocks.tryRevokeWorkspaceMemberRealtimeConnections,
    ).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      userId: "member-1",
      reason: "reauth",
      errorMessage: "Failed to revoke inbox team member realtime connections",
    })
  })

  test("revokes removed members", async () => {
    mocks.teamMemberFindMany.mockResolvedValue([
      {
        id: "member-row-1",
        userId: "member-1",
        user: { email: "member@example.com", name: "Member" },
      },
    ])

    await inboxTeamService.removeMembers(
      { workspaceId: WORKSPACE_ID, inboxTeamId: TEAM_ID },
      ["member-row-1"],
    )

    expect(
      mocks.tryRevokeWorkspaceMemberRealtimeConnections,
    ).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      userId: "member-1",
      reason: "reauth",
      errorMessage: "Failed to revoke inbox team member realtime connections",
    })
  })
})
