import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const deleteWhere = vi.fn()
  const selectWhere = vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) }))
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  return {
    decrement: vi.fn(),
    deleteWhere,
    dispatchAuditRecord: vi.fn(),
    findFirst: vi.fn(),
    select: vi.fn(() => ({ from: selectFrom })),
    selectFrom,
    selectWhere,
  }
})

const makeClient = () => ({
  query: {
    workspaceMemberModel: { findFirst: mocks.findFirst },
  },
  delete: vi.fn(() => ({ where: mocks.deleteWhere })),
  select: mocks.select,
})

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/workspace-usage/service", () => ({
  workspaceUsageService: { decrement: mocks.decrement },
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
    userId: "workspaceMember.userId",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(),
}))

const { workspaceMemberService } = await import(
  "../src/workspace-member/service"
)

describe("workspaceMemberService.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.decrement.mockResolvedValue(undefined)
    mocks.findFirst.mockResolvedValue({
      id: "member-1",
      user: { name: "Ada", email: "ada@example.com" },
    })
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

describe("workspaceMemberService.findMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("looks up a plain (workspaceId, userId) row", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await workspaceMemberService.findMembership({
      workspaceId: "workspace-1",
      userId: "user-1",
    })

    const [{ where }] = mocks.findFirst.mock.calls[0]
    expect(where).toEqual({
      workspaceId: "workspace-1",
      userId: "user-1",
    })
  })
})

describe("workspaceMemberService.isMember", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("scopes the select to (workspaceId, userId)", async () => {
    await workspaceMemberService.isMember({
      workspaceId: "workspace-1",
      userId: "user-1",
    })

    expect(mocks.selectFrom).toHaveBeenCalled()
    const [whereArg] = mocks.selectWhere.mock.calls[0]
    expect(whereArg).toMatchObject({
      and: [
        { eq: ["workspaceMember.workspaceId", "workspace-1"] },
        { eq: ["workspaceMember.userId", "user-1"] },
      ],
    })
  })
})
