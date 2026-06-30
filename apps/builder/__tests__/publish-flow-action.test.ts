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
  mockInvalidateList,
  mockCreateId,
} = vi.hoisted(() => {
  const mockTxInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockTxInsert = vi.fn().mockReturnValue({ values: mockTxInsertValues })
  const mockTxWhere = vi.fn().mockResolvedValue(undefined)
  const mockTxSet = vi.fn().mockReturnValue({ where: mockTxWhere })
  const mockTxUpdate = vi.fn().mockReturnValue({ set: mockTxSet })

  return {
    mockFlowFindFirst: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockTxInsert,
    mockTxInsertValues,
    mockTxUpdate,
    mockTxSet,
    mockTxWhere,
    mockInvalidateList: vi.fn().mockResolvedValue(undefined),
    mockCreateId: vi.fn(),
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  flowVersionService: { invalidateList: mockInvalidateList },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { flowModel: { findFirst: mockFlowFindFirst } },
    transaction: mockDbTransaction,
  },
  and: (...args: unknown[]) => ({ and: args }),
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

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, createId: mockCreateId }
})

const { publishFlow } = await import(
  "../src/features/flows/actions/publish-flow-action"
)

const findInsertedVersion = () =>
  mockTxInsertValues.mock.calls[0]?.[0] as {
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

describe("publishFlow", () => {
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

    await publishFlow(
      { workspaceId: "1", id: "10" },
      { nodes: [currentNode], edges: [] },
    )

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

    expect(mockInvalidateList).toHaveBeenCalledWith("10")
  })

  test("throws when the flow has no draft version", async () => {
    mockFlowFindFirst.mockResolvedValue({
      id: "10",
      workspaceId: "1",
      flowVersions: [],
    })

    await expect(
      publishFlow({ workspaceId: "1", id: "10" }, { nodes: [], edges: [] }),
    ).rejects.toThrow("Flow not found")
  })
})
