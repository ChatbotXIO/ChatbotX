// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
}))

vi.mock("../src/client", () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
  eq: (...args: unknown[]) => ({ op: "eq", args }),
  and: (...args: unknown[]) => ({ op: "and", args }),
  inArray: (...args: unknown[]) => ({ op: "inArray", args }),
  sql: (strings: TemplateStringsArray) => ({ op: "sql", raw: strings[0] }),
}))

vi.mock("../src/schema", () => ({
  workspaceMemberModel: {
    id: "id",
    workspaceId: "workspaceId",
    userId: "userId",
    permissions: "permissions",
    onlineSince: "onlineSince",
  },
}))

const { workspaceMemberRepository } = await import(
  "../src/repositories/workspace-member/repository"
)

describe("workspaceMemberRepository.listPermissionsByUserIds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
  })

  test("returns [] without querying when userIds is empty", async () => {
    const result = await workspaceMemberRepository.listPermissionsByUserIds({
      workspaceId: "ws-1",
      userIds: [],
    })

    expect(result).toEqual([])
    expect(mocks.select).not.toHaveBeenCalled()
  })

  test("scopes the query to workspaceId AND the requested userIds", async () => {
    mocks.where.mockResolvedValue([
      { userId: "u1", permissions: { contacts: true } },
    ])

    const result = await workspaceMemberRepository.listPermissionsByUserIds({
      workspaceId: "ws-1",
      userIds: ["u1", "u2"],
    })

    expect(result).toEqual([{ userId: "u1", permissions: { contacts: true } }])
    expect(mocks.select).toHaveBeenCalledWith({
      userId: "userId",
      permissions: "permissions",
    })
    const [whereArg] = mocks.where.mock.calls[0]
    expect(whereArg).toEqual({
      op: "and",
      args: [
        { op: "eq", args: ["workspaceId", "ws-1"] },
        { op: "inArray", args: ["userId", ["u1", "u2"]] },
      ],
    })
  })
})

describe("workspaceMemberRepository.markOnlineBulk", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.set.mockReturnValue({ where: mocks.updateWhere })
    mocks.updateWhere.mockResolvedValue(undefined)
  })

  test("sets onlineSince=now() for every userId in ONE bulk UPDATE, scoped to workspaceId", async () => {
    await workspaceMemberRepository.markOnlineBulk({
      workspaceId: "ws-1",
      userIds: ["u1", "u2"],
    })

    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.set).toHaveBeenCalledWith({
      onlineSince: { op: "sql", raw: "now()" },
    })
    expect(mocks.updateWhere).toHaveBeenCalledWith({
      op: "and",
      args: [
        { op: "eq", args: ["workspaceId", "ws-1"] },
        { op: "inArray", args: ["userId", ["u1", "u2"]] },
      ],
    })
  })

  test("is a no-op with no query when userIds is empty", async () => {
    await workspaceMemberRepository.markOnlineBulk({
      workspaceId: "ws-1",
      userIds: [],
    })

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("a support-session userId with no matching row is included in the same IN clause, not special-cased (the UPDATE...WHERE itself is what silently skips it)", async () => {
    await workspaceMemberRepository.markOnlineBulk({
      workspaceId: "ws-1",
      userIds: ["u1", "support-session-user"],
    })

    // There is no branch that inspects/filters `userIds` for a matching
    // row — the whole batch goes into ONE `inArray`, and it is Postgres's
    // `UPDATE ... WHERE` that naturally updates 0 rows for an id with no
    // match rather than erroring. Asserting the exact call shape (not just
    // "resolves") proves that behaviour, instead of only proving the
    // promise didn't reject.
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.set).toHaveBeenCalledWith({
      onlineSince: { op: "sql", raw: "now()" },
    })
    expect(mocks.updateWhere).toHaveBeenCalledWith({
      op: "and",
      args: [
        { op: "eq", args: ["workspaceId", "ws-1"] },
        {
          op: "inArray",
          args: ["userId", ["u1", "support-session-user"]],
        },
      ],
    })
  })
})
