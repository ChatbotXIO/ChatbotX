import { describe, expect, test, vi } from "vitest"
import { workspaceSipNodeRepository } from "../src/repositories/workspace-sip-node/repository"
import { workspaceSipNodeModel } from "../src/schema"

describe("workspaceSipNodeRepository.pinOrGet", () => {
  test("returns the existing pin without choosing a node again", async () => {
    const existing = {
      workspaceId: "ws-1",
      nodeId: "node-a",
      createdAt: new Date(),
    }
    const findFirst = vi.fn().mockResolvedValue(existing)
    const chooseNode = vi.fn()
    const trx = { query: { workspaceSipNodeModel: { findFirst } } }

    const result = await workspaceSipNodeRepository.pinOrGet(
      { workspaceId: "ws-1", chooseNode },
      trx as never,
    )

    expect(result).toEqual(existing)
    expect(chooseNode).not.toHaveBeenCalled()
  })

  test("on first pin, counts nodes, inserts with ON CONFLICT DO NOTHING, and reads back", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(undefined) // no existing pin
      .mockResolvedValueOnce({
        workspaceId: "ws-2",
        nodeId: "node-b",
        createdAt: new Date(),
      }) // read-back after insert

    const groupByResult = [
      { nodeId: "node-a", count: 10 },
      { nodeId: "node-b", count: 3 },
    ]
    const selectChain = {
      select: vi.fn(),
      from: vi.fn(),
      groupBy: vi.fn(),
    }
    selectChain.select.mockReturnValue(selectChain)
    selectChain.from.mockReturnValue(selectChain)
    selectChain.groupBy.mockResolvedValue(groupByResult)

    const insertChain = {
      insert: vi.fn(),
      values: vi.fn(),
      onConflictDoNothing: vi.fn(),
    }
    insertChain.insert.mockReturnValue(insertChain)
    insertChain.values.mockReturnValue(insertChain)
    insertChain.onConflictDoNothing.mockResolvedValue(undefined)

    const chooseNode = vi.fn((countsByNode: Record<string, number>) => {
      // Least-loaded of the two.
      return countsByNode["node-a"] > countsByNode["node-b"]
        ? "node-b"
        : "node-a"
    })

    const trx = {
      query: { workspaceSipNodeModel: { findFirst } },
      ...selectChain,
      ...insertChain,
    }

    const result = await workspaceSipNodeRepository.pinOrGet(
      { workspaceId: "ws-2", chooseNode },
      trx as never,
    )

    expect(chooseNode).toHaveBeenCalledWith({ "node-a": 10, "node-b": 3 })
    expect(insertChain.insert).toHaveBeenCalledWith(workspaceSipNodeModel)
    expect(insertChain.values).toHaveBeenCalledWith({
      workspaceId: "ws-2",
      nodeId: "node-b",
    })
    expect(insertChain.onConflictDoNothing).toHaveBeenCalledWith({
      target: workspaceSipNodeModel.workspaceId,
    })
    expect(result).toEqual({
      workspaceId: "ws-2",
      nodeId: "node-b",
      createdAt: expect.any(Date),
    })
  })

  test("a second caller sees the winner's row instead of re-choosing a node", async () => {
    // First caller: no existing pin -> chooses a node -> inserts -> reads
    // back the row it (or a concurrent racer) actually won.
    const winningRow = {
      workspaceId: "ws-3",
      nodeId: "node-a",
      createdAt: new Date(),
    }
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(winningRow)
      // Second caller: the row already exists by the time it checks.
      .mockResolvedValueOnce(winningRow)

    const selectChain = {
      select: vi.fn(),
      from: vi.fn(),
      groupBy: vi.fn(),
    }
    selectChain.select.mockReturnValue(selectChain)
    selectChain.from.mockReturnValue(selectChain)
    selectChain.groupBy.mockResolvedValue([])

    const insertChain = {
      insert: vi.fn(),
      values: vi.fn(),
      onConflictDoNothing: vi.fn(),
    }
    insertChain.insert.mockReturnValue(insertChain)
    insertChain.values.mockReturnValue(insertChain)
    insertChain.onConflictDoNothing.mockResolvedValue(undefined)

    const trx = {
      query: { workspaceSipNodeModel: { findFirst } },
      ...selectChain,
      ...insertChain,
    }

    const chooseNode = vi.fn(() => "node-a")

    const first = await workspaceSipNodeRepository.pinOrGet(
      { workspaceId: "ws-3", chooseNode },
      trx as never,
    )
    const second = await workspaceSipNodeRepository.pinOrGet(
      { workspaceId: "ws-3", chooseNode },
      trx as never,
    )

    expect(first).toEqual(winningRow)
    expect(second).toEqual(winningRow)
    // The second caller never had to choose — its `INSERT … ON CONFLICT
    // DO NOTHING` path is skipped entirely once a pin already exists.
    expect(chooseNode).toHaveBeenCalledTimes(1)
    expect(insertChain.insert).toHaveBeenCalledTimes(1)
  })
})
