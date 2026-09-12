import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import { agentSipPresenceRepository } from "../src/repositories/agent-sip-presence/repository"
import { agentSipPresenceModel } from "../src/schema"

const pgDialect = new PgDialect()
const renderSql = (fragment: unknown) =>
  pgDialect.sqlToQuery(fragment as Parameters<PgDialect["sqlToQuery"]>[0]).sql

describe("agentSipPresenceRepository.selectRingTargets", () => {
  test("orders least-recently-rung first, and bumps lastRungAt for the winners", async () => {
    const selectedUserIds = ["user-2", "user-3"]

    const selectChain = {
      select: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    selectChain.select.mockReturnValue(selectChain)
    selectChain.from.mockReturnValue(selectChain)
    selectChain.innerJoin.mockReturnValue(selectChain)
    selectChain.where.mockReturnValue(selectChain)
    selectChain.orderBy.mockReturnValue(selectChain)
    selectChain.limit.mockResolvedValue(
      selectedUserIds.map((userId) => ({ userId })),
    )

    const updateChain = {
      update: vi.fn(),
      set: vi.fn(),
      where: vi.fn(),
    }
    updateChain.update.mockReturnValue(updateChain)
    updateChain.set.mockReturnValue(updateChain)
    updateChain.where.mockResolvedValue(undefined)

    const trx = { ...selectChain, ...updateChain }

    const result = await agentSipPresenceRepository.selectRingTargets(
      {
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        limit: 8,
        now: new Date("2026-09-01T00:00:00.000Z"),
      },
      trx as never,
    )

    expect(result).toEqual(selectedUserIds)

    // Uses `AgentSipPresence_ring_idx`'s column order:
    // `lastRungAt ASC NULLS FIRST`.
    const orderByArg = renderSql(selectChain.orderBy.mock.calls[0]?.[0])
    expect(orderByArg).toContain("lastRungAt")
    expect(orderByArg).toContain("ASC NULLS FIRST")

    expect(selectChain.limit).toHaveBeenCalledWith(8)

    // The winners' lastRungAt is bumped in the same transaction.
    expect(updateChain.update).toHaveBeenCalledWith(agentSipPresenceModel)
    expect(updateChain.set).toHaveBeenCalledWith({
      lastRungAt: new Date("2026-09-01T00:00:00.000Z"),
    })
  })

  test("returns an empty array and skips the bump when nobody is registered", async () => {
    const selectChain = {
      select: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    selectChain.select.mockReturnValue(selectChain)
    selectChain.from.mockReturnValue(selectChain)
    selectChain.innerJoin.mockReturnValue(selectChain)
    selectChain.where.mockReturnValue(selectChain)
    selectChain.orderBy.mockReturnValue(selectChain)
    selectChain.limit.mockResolvedValue([])

    const update = vi.fn()
    const trx = { ...selectChain, update }

    const result = await agentSipPresenceRepository.selectRingTargets(
      { workspaceId: "ws-1", inboxId: "inbox-1", limit: 8 },
      trx as never,
    )

    expect(result).toEqual([])
    expect(update).not.toHaveBeenCalled()
  })
})
