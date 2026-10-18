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
