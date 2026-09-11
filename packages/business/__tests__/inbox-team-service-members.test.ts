import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listExistingUserIds: vi.fn(),
  insertValues: vi.fn(),
  teamFindFirst: vi.fn(),
  teamMemberFindMany: vi.fn(),
  userFindMany: vi.fn(),
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
    query: {
      inboxTeamModel: { findFirst: mocks.teamFindFirst },
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

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: { listExistingUserIds: mocks.listExistingUserIds },
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(),
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
