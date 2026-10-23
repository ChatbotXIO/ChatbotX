import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { inboxTeamMemberRepository } from "../src/repositories/inbox-team-member/repository"
import { inboxTeamModel } from "../src/schema"

const renderPredicate = (clause: unknown): string => {
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child)
      }
      return
    }
    if (typeof node === "string" || typeof node === "number") {
      parts.push(String(node))
      return
    }
    if (!node || typeof node !== "object") {
      return
    }
    if ("name" in node && "table" in node && typeof node.name === "string") {
      parts.push(`"${node.name}"`)
      return
    }
    if ("queryChunks" in node && Array.isArray(node.queryChunks)) {
      walk(node.queryChunks)
      return
    }
    if ("value" in node) {
      parts.push(String(node.value))
    }
  }
  walk(clause)
  return parts.join("").replace(/[()]/g, "").replace(/\s+/g, " ").trim()
}

const createSelectTx = <T>(rows: T[]) => {
  const select = vi.fn()
  const from = vi.fn()
  const innerJoin = vi.fn()
  const where = vi.fn().mockResolvedValue(rows)
  select.mockReturnValue({ from })
  from.mockReturnValue({ innerJoin })
  innerJoin.mockReturnValue({ where })
  return {
    tx: { select } as unknown as DatabaseClient,
    innerJoin,
    where,
  }
}

describe("inboxTeamMemberRepository workspace scoping", () => {
  test("returns only member ids selected through the workspace-scoped team join", async () => {
    const { tx, innerJoin, where } = createSelectTx([{ userId: "user-1" }])

    await expect(
      inboxTeamMemberRepository.listUserIdsByTeamId({
        workspaceId: "workspace-1",
        inboxTeamId: "team-1",
        tx,
      }),
    ).resolves.toEqual(["user-1"])

    expect(innerJoin).toHaveBeenCalledWith(inboxTeamModel, expect.anything())
    const joinCall = innerJoin.mock.calls[0]
    if (!joinCall) {
      throw new Error("Expected InboxTeam join")
    }
    expect(renderPredicate(joinCall[1])).toContain('"inboxTeamId" = "id"')

    expect(renderPredicate(where.mock.calls[0]?.[0])).toContain(
      '"workspaceId" = workspace-1 and "inboxTeamId" = team-1',
    )
  })

  test("returns member ids for all workspace-scoped team ids in one query", async () => {
    const { tx, innerJoin, where } = createSelectTx([
      { userId: "user-1" },
      { userId: "user-2" },
    ])

    await expect(
      inboxTeamMemberRepository.listUserIdsByTeamIds({
        workspaceId: "workspace-1",
        inboxTeamIds: ["team-1", "team-2"],
        tx,
      }),
    ).resolves.toEqual(["user-1", "user-2"])

    expect(innerJoin).toHaveBeenCalledWith(inboxTeamModel, expect.anything())
    expect(renderPredicate(where.mock.calls[0]?.[0])).toContain(
      '"workspaceId" = workspace-1',
    )
  })

  test("returns only team ids selected through the workspace-scoped member join", async () => {
    const { tx, innerJoin, where } = createSelectTx([{ inboxTeamId: "team-1" }])

    await expect(
      inboxTeamMemberRepository.listTeamIdsByUserId({
        workspaceId: "workspace-1",
        userId: "user-1",
        tx,
      }),
    ).resolves.toEqual(["team-1"])

    expect(innerJoin).toHaveBeenCalledWith(inboxTeamModel, expect.anything())
    const joinCall = innerJoin.mock.calls[0]
    if (!joinCall) {
      throw new Error("Expected InboxTeam join")
    }
    expect(renderPredicate(joinCall[1])).toContain('"inboxTeamId" = "id"')

    expect(renderPredicate(where.mock.calls[0]?.[0])).toContain(
      '"workspaceId" = workspace-1 and "userId" = user-1',
    )
  })
})

describe("inboxTeamMemberRepository.listTeamNamesByUserId", () => {
  const createNamedSelectTx = (rows: { name: string }[]) => {
    const orderBy = vi.fn().mockResolvedValue(rows)
    const where = vi.fn(() => ({ orderBy }))
    const innerJoin = vi.fn(() => ({ where }))
    const from = vi.fn(() => ({ innerJoin }))
    const select = vi.fn(() => ({ from }))
    return {
      tx: { select } as unknown as DatabaseClient,
      innerJoin,
      where,
      orderBy,
    }
  }

  test("returns the team names of the user, scoped to the workspace through the team join", async () => {
    const { tx, innerJoin, where, orderBy } = createNamedSelectTx([
      { name: "Sales" },
      { name: "Support" },
    ])

    await expect(
      inboxTeamMemberRepository.listTeamNamesByUserId({
        workspaceId: "workspace-1",
        userId: "user-1",
        tx,
      }),
    ).resolves.toEqual(["Sales", "Support"])

    expect(innerJoin).toHaveBeenCalledWith(inboxTeamModel, expect.anything())
    expect(renderPredicate(where.mock.calls[0]?.[0])).toContain(
      '"workspaceId" = workspace-1 and "userId" = user-1',
    )
    expect(orderBy).toHaveBeenCalledTimes(1)
  })

  test("returns an empty list for a user in no team", async () => {
    const { tx } = createNamedSelectTx([])

    await expect(
      inboxTeamMemberRepository.listTeamNamesByUserId({
        workspaceId: "workspace-1",
        userId: "user-1",
        tx,
      }),
    ).resolves.toEqual([])
  })
})
