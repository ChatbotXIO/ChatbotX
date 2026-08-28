// @vitest-environment node

import { sendMessageNodeDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFlowFindFirst,
  mockDbTransaction,
  mockTxInsert,
  mockTxInsertValues,
  mockTxUpdate,
  mockTxSet,
  mockTxWhere,
  mockInvalidateCacheTags,
  mockCreateId,
  mockFindOrFail,
} = vi.hoisted(() => {
  const insertValues = vi.fn().mockResolvedValue(undefined)
  const insert = vi.fn().mockReturnValue({ values: insertValues })
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set: updateSet })

  return {
    mockFlowFindFirst: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockTxInsert: insert,
    mockTxInsertValues: insertValues,
    mockTxUpdate: update,
    mockTxSet: updateSet,
    mockTxWhere: updateWhere,
    mockInvalidateCacheTags: vi.fn().mockResolvedValue(undefined),
    mockCreateId: vi.fn(),
    mockFindOrFail: vi.fn(),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { flowModel: { findFirst: mockFlowFindFirst } },
    transaction: mockDbTransaction,
  },
  findOrFail: mockFindOrFail,
  and: (...args: unknown[]) => ({ and: args }),
  desc: (...args: unknown[]) => ({ desc: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowModel: { id: "flowModel.id" },
  flowVersionModel: {
    id: "flowVersionModel.id",
    flowId: "flowVersionModel.flowId",
    isLatest: "flowVersionModel.isLatest",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(async (_key: string, resolver: () => unknown) => resolver()),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, createId: mockCreateId }
})

class FakeBaseService {
  invalidateCacheTags = mockInvalidateCacheTags
  audit = vi.fn()
}
vi.mock("../../base.service", () => ({ BaseService: FakeBaseService }))

vi.mock("../../errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

const { flowVersionService } = await import("../service")

const findInsertedVersion = () =>
  mockTxInsertValues.mock.calls[0]?.[0] as {
    id: string
    nodes: Array<{ id: string }>
    startNodeId: string
    isDraft: boolean
    isLatest: boolean
  }

const findDraftUpdateValue = () => {
  const call = mockTxSet.mock.calls.find(
    ([value]) => value && "nodes" in (value as object),
  )
  return call?.[0] as { nodes: Array<{ id: string }> } | undefined
}

describe("FlowVersionService.publish", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTxInsertValues.mockResolvedValue(undefined)
    mockTxInsert.mockReturnValue({ values: mockTxInsertValues })
    mockTxWhere.mockResolvedValue(undefined)
    mockTxSet.mockReturnValue({ where: mockTxWhere })
    mockTxUpdate.mockReturnValue({ set: mockTxSet })
    mockCreateId.mockReturnValue("new-version-id")
    mockDbTransaction.mockImplementation(
      async (
        fn: (tx: {
          insert: typeof mockTxInsert
          update: typeof mockTxUpdate
        }) => Promise<unknown>,
      ) => fn({ insert: mockTxInsert, update: mockTxUpdate }),
    )
  })

  test("publishes the current input nodes and updates the draft, ignoring stale draft data", async () => {
    const staleNode = sendMessageNodeDefaultFn({
      nodeProps: { id: "1", position: { x: 0, y: 0 } },
      dataProps: { name: "Stale draft", isStartNode: true },
      detailProps: {
        beforeStep: {
          id: "11",
          stepType: "chooseChannel",
          channel: "omnichannel",
        },
      },
    })
    const currentNode = sendMessageNodeDefaultFn({
      nodeProps: { id: "2", position: { x: 100, y: 100 } },
      dataProps: { name: "Current canvas", isStartNode: true },
      detailProps: {
        beforeStep: {
          id: "12",
          stepType: "chooseChannel",
          channel: "omnichannel",
        },
      },
    })

    mockFlowFindFirst.mockResolvedValue({
      id: "10",
      workspaceId: "1",
      flowVersions: [
        {
          id: "100",
          startNodeId: "1",
          nodes: [staleNode],
          edges: [],
        },
      ],
    })

    await flowVersionService.publish({
      workspaceId: "1",
      id: "10",
      data: { nodes: [currentNode], edges: [] },
    })

    const inserted = findInsertedVersion()
    expect(inserted.isDraft).toBe(false)
    expect(inserted.isLatest).toBe(true)
    expect(inserted.startNodeId).toBe("1")
    expect(inserted.nodes).toEqual([
      expect.objectContaining({
        id: "2",
        data: expect.objectContaining({ name: "Current canvas" }),
      }),
    ])

    const draftUpdate = findDraftUpdateValue()
    expect(draftUpdate?.nodes).toEqual([expect.objectContaining({ id: "2" })])

    expect(mockInvalidateCacheTags).toHaveBeenCalledWith("flows:10:versions")
  })

  /**
   * `Flow.currentVersionId` is how an unpinned run and a magic-link click both
   * find the live version (`detectFlowVersion`,
   * `flowVersionService.findForButtonPayload`). If publish ever stopped
   * repointing it — relying on the `isLatest` flag alone, say — both would keep
   * serving the *previous* version's nodes, which is the exact "buttons still
   * fire the old action after publish" bug. Pinned here because the flag and the
   * column are written by two separate statements.
   */
  test("repoints the flow at the version it just inserted", async () => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: { id: "2", position: { x: 0, y: 0 } },
      dataProps: { name: "Canvas", isStartNode: true },
      detailProps: {
        beforeStep: {
          id: "12",
          stepType: "chooseChannel",
          channel: "omnichannel",
        },
      },
    })
    mockFlowFindFirst.mockResolvedValue({
      id: "10",
      workspaceId: "1",
      flowVersions: [{ id: "100", startNodeId: "2", nodes: [], edges: [] }],
    })

    await flowVersionService.publish({
      workspaceId: "1",
      id: "10",
      data: { nodes: [node], edges: [] },
    })

    const inserted = findInsertedVersion()
    expect(mockTxSet).toHaveBeenCalledWith({ currentVersionId: inserted.id })
    expect(inserted.isLatest).toBe(true)
  })

  test("throws when the flow has no draft version", async () => {
    mockFlowFindFirst.mockResolvedValue({
      id: "10",
      workspaceId: "1",
      flowVersions: [],
    })

    await expect(
      flowVersionService.publish({
        workspaceId: "1",
        id: "10",
        data: { nodes: [], edges: [] },
      }),
    ).rejects.toThrow("Flow not found")
  })
})
