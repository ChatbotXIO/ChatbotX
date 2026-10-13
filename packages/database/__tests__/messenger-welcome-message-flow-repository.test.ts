import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { messengerWelcomeMessageFlowRepository as repository } from "../src/repositories/messenger-welcome-message-flow/repository"
import { messengerWelcomeMessageFlowModel } from "../src/schema"

const asTx = (value: unknown) => value as unknown as DatabaseClient

describe("messengerWelcomeMessageFlowRepository", () => {
  test("insertCurrent writes a current row with every column", async () => {
    const values = vi.fn().mockResolvedValue(undefined)
    const insert = vi.fn().mockReturnValue({ values })
    await repository.insertCurrent(
      {
        workspaceId: "1",
        flowId: "2",
        integrationMessengerId: "3",
        pageId: "p",
        metaFlowId: "m",
        flowVersionId: "4",
      },
      asTx({ insert }),
    )
    expect(insert).toHaveBeenCalledWith(messengerWelcomeMessageFlowModel)
    expect(values).toHaveBeenCalledWith({
      workspaceId: "1",
      flowId: "2",
      integrationMessengerId: "3",
      pageId: "p",
      metaFlowId: "m",
      flowVersionId: "4",
      status: "current",
    })
  })

  test("findCurrent looks up the current row of a flow on one page", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined)
    await repository.findCurrent(
      { flowId: "2", integrationMessengerId: "3" },
      asTx({ query: { messengerWelcomeMessageFlowModel: { findFirst } } }),
    )
    expect(findFirst).toHaveBeenCalledWith({
      where: { flowId: "2", integrationMessengerId: "3", status: "current" },
    })
  })

  test("listCurrentByFlow scopes by workspace, flow and status", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    await repository.listCurrentByFlow(
      { workspaceId: "1", flowId: "2" },
      asTx({ query: { messengerWelcomeMessageFlowModel: { findMany } } }),
    )
    expect(findMany).toHaveBeenCalledWith({
      where: { workspaceId: "1", flowId: "2", status: "current" },
      columns: { integrationMessengerId: true, pageId: true, metaFlowId: true },
      orderBy: { createdAt: "asc" },
    })
  })

  test("listAllByFlow returns current and superseded rows of a flow", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    await repository.listAllByFlow(
      { workspaceId: "1", flowId: "2" },
      asTx({ query: { messengerWelcomeMessageFlowModel: { findMany } } }),
    )
    expect(findMany).toHaveBeenCalledWith({
      where: { workspaceId: "1", flowId: "2" },
    })
  })

  test("markSuperseded flips the status", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    await repository.markSuperseded({ id: "9" }, asTx({ update }))
    expect(set).toHaveBeenCalledWith({ status: "superseded" })
    expect(where).toHaveBeenCalledTimes(1)
  })

  test("replaceCurrent supersedes the previous row then inserts, in one transaction", async () => {
    const calls: string[] = []
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn((value: unknown) => {
      calls.push(`update:${JSON.stringify(value)}`)
      return { where }
    })
    const values = vi.fn((value: { metaFlowId: string }) => {
      calls.push(`insert:${value.metaFlowId}`)
      return Promise.resolve()
    })
    const trx = {
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn().mockReturnValue({ values }),
      delete: vi.fn(),
    }
    const transaction = vi.fn((fn: (tx: unknown) => Promise<void>) => fn(trx))
    const next = {
      workspaceId: "1",
      flowId: "2",
      integrationMessengerId: "3",
      pageId: "p",
      metaFlowId: "m2",
      flowVersionId: "4",
    }

    await repository.replaceCurrent(
      { previous: { id: "9", action: "supersede" }, next },
      asTx({ transaction }),
    )

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['update:{"status":"superseded"}', "insert:m2"])
    expect(trx.delete).not.toHaveBeenCalled()
  })

  test("replaceCurrent deletes the previous row when it is gone from Meta", async () => {
    const delWhere = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn().mockResolvedValue(undefined)
    const trx = {
      update: vi.fn(),
      insert: vi.fn().mockReturnValue({ values }),
      delete: vi.fn().mockReturnValue({ where: delWhere }),
    }
    const transaction = vi.fn((fn: (tx: unknown) => Promise<void>) => fn(trx))

    await repository.replaceCurrent(
      {
        previous: { id: "9", action: "delete" },
        next: {
          workspaceId: "1",
          flowId: "2",
          integrationMessengerId: "3",
          pageId: "p",
          metaFlowId: "m2",
          flowVersionId: "4",
        },
      },
      asTx({ transaction }),
    )

    expect(trx.delete).toHaveBeenCalledWith(messengerWelcomeMessageFlowModel)
    expect(trx.update).not.toHaveBeenCalled()
    expect(values).toHaveBeenCalledTimes(1)
  })

  test("deleteByIds skips the query for an empty list", async () => {
    const del = vi.fn()
    await repository.deleteByIds({ ids: [] }, asTx({ delete: del }))
    expect(del).not.toHaveBeenCalled()
  })

  test("deleteByIds deletes the given rows", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const del = vi.fn().mockReturnValue({ where })
    await repository.deleteByIds({ ids: ["1", "2"] }, asTx({ delete: del }))
    expect(del).toHaveBeenCalledWith(messengerWelcomeMessageFlowModel)
    expect(where).toHaveBeenCalledTimes(1)
  })
})
