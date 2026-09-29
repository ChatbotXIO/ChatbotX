// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
}))

vi.mock("../src/client", () => ({
  db: {
    select: mocks.select,
  },
  eq: (...args: unknown[]) => ({ op: "eq", args }),
  and: (...args: unknown[]) => ({ op: "and", args }),
}))

vi.mock("../src/schema", () => ({
  inboxTeamMemberModel: { inboxTeamId: "inboxTeamId", userId: "userId" },
  inboxTeamModel: { id: "id", workspaceId: "workspaceId" },
}))

const { inboxTeamMemberRepository } = await import(
  "../src/repositories/inbox-team-member/repository"
)

describe("inboxTeamMemberRepository.listUserIdsByTeamId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ innerJoin: mocks.innerJoin })
    mocks.innerJoin.mockReturnValue({ where: mocks.where })
  })

  test("joins InboxTeam to scope by workspaceId AND filters by inboxTeamId", async () => {
    mocks.where.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }])

    const result = await inboxTeamMemberRepository.listUserIdsByTeamId({
      workspaceId: "ws-1",
      inboxTeamId: "team-1",
    })

    expect(result).toEqual(["u1", "u2"])
    expect(mocks.innerJoin).toHaveBeenCalledWith(
      { id: "id", workspaceId: "workspaceId" },
      { op: "eq", args: ["inboxTeamId", "id"] },
    )
    const [whereArg] = mocks.where.mock.calls[0]
    expect(whereArg).toEqual({
      op: "and",
      args: [
        { op: "eq", args: ["workspaceId", "ws-1"] },
        { op: "eq", args: ["inboxTeamId", "team-1"] },
      ],
    })
  })

  test("returns [] when the team has no members", async () => {
    mocks.where.mockResolvedValue([])

    const result = await inboxTeamMemberRepository.listUserIdsByTeamId({
      workspaceId: "ws-1",
      inboxTeamId: "team-1",
    })

    expect(result).toEqual([])
  })
})
