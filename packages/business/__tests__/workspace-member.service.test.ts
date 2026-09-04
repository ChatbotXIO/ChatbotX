import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const deleteWhere = vi.fn()
  return {
    decrement: vi.fn(),
    deleteWhere,
    dispatchAuditRecord: vi.fn(),
    findFirst: vi.fn(),
  }
})

const makeClient = () => ({
  query: {
    workspaceMemberModel: { findFirst: mocks.findFirst },
  },
  delete: vi.fn(() => ({ where: mocks.deleteWhere })),
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
