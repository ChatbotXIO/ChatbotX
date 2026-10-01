// @vitest-environment node

import {
  sendMessageNodeDefaultFn,
  sendVideoStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateId,
  mockDbTransaction,
  mockFlowFindFirst,
  mockTxInsert,
  mockTxInsertValues,
  mockTxUpdate,
  mockTxSet,
  mockInvalidateCacheTags,
  mockDispatchAuditRecord,
} = vi.hoisted(() => {
  const mockTxInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockTxInsert = vi.fn().mockReturnValue({ values: mockTxInsertValues })
  const mockTxWhere = vi.fn().mockResolvedValue(undefined)
  const mockTxSet = vi.fn().mockReturnValue({ where: mockTxWhere })
  const mockTxUpdate = vi.fn().mockReturnValue({ set: mockTxSet })

  return {
    mockCreateId: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockFlowFindFirst: vi.fn(),
    mockTxInsert,
    mockTxInsertValues,
    mockTxUpdate,
    mockTxSet,
    mockInvalidateCacheTags: vi.fn().mockResolvedValue(undefined),
    mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { flowModel: { findFirst: mockFlowFindFirst } },
    transaction: mockDbTransaction,
    update: mockTxUpdate,
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  desc: (...args: unknown[]) => ({ desc: args }),
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
  withCache: (_key: string, fn: () => Promise<unknown>): Promise<unknown> =>
    fn(),
  invalidateCacheByTags: mockInvalidateCacheTags,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: mockCreateId,
}))

vi.mock("../src/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { flowVersionService } = await import("../src/flow-version/service")

describe("flowVersionService.publish", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("resets other latest versions, syncs the draft, inserts the published version, repoints currentVersionId, invalidates cache, and audits", async () => {
    mockFlowFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      flowVersions: [{ id: "draft-1", startNodeId: "node-1" }],
    })
    mockCreateId
      .mockReturnValueOnce("1")
      .mockReturnValueOnce("2")
      .mockReturnValue("new-version-1")
    mockDbTransaction.mockImplementation(
      async (
        fn: (tx: {
          insert: typeof mockTxInsert
          update: typeof mockTxUpdate
        }) => Promise<unknown>,
      ) => fn({ insert: mockTxInsert, update: mockTxUpdate }),
    )

    const nodes = [sendMessageNodeDefaultFn({})]
    await flowVersionService.publish({
      workspaceId: "ws-1",
      flowId: "flow-1",
      nodes,
      edges: [],
    })

    // 1) reset other latest versions
    expect(mockTxUpdate).toHaveBeenNthCalledWith(1, {
      id: "flowVersionModel.id",
      flowId: "flowVersionModel.flowId",
      isLatest: "flowVersionModel.isLatest",
    })
    expect(mockTxSet).toHaveBeenNthCalledWith(1, { isLatest: false })

    // 2) sync draft nodes/edges
    expect(mockTxSet).toHaveBeenNthCalledWith(2, {
      nodes,
      edges: [],
    })

    // 3) insert new published version
    expect(mockTxInsert).toHaveBeenCalledWith({
      id: "flowVersionModel.id",
      flowId: "flowVersionModel.flowId",
      isLatest: "flowVersionModel.isLatest",
    })
    expect(mockTxInsertValues).toHaveBeenCalledWith({
      id: "new-version-1",
      workspaceId: "ws-1",
      flowId: "flow-1",
      isDraft: false,
      isLatest: true,
      nodes,
      edges: [],
      startNodeId: "node-1",
    })

    // 4) repoint currentVersionId
    expect(mockTxSet).toHaveBeenNthCalledWith(3, {
      currentVersionId: "new-version-1",
    })

    expect(mockInvalidateCacheTags).toHaveBeenCalledWith([
      "flows:flow-1:versions",
    ])
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "publish",
      detail: "published a flow (#flow-1)",
    })
  })

  test("rejects a channel-incompatible graph before reading or mutating the flow", async () => {
    mockCreateId.mockReturnValue("1")
    const node = sendMessageNodeDefaultFn({})
    node.data.details.beforeStep.channel = "tiktok"
    node.data.details.steps = [sendVideoStepDefaultFn()]

    await expect(
      flowVersionService.publish({
        workspaceId: "ws-1",
        flowId: "flow-1",
        nodes: [node],
        edges: [],
      }),
    ).rejects.toMatchObject({ name: "FlowAuthoringException" })

    expect(mockFlowFindFirst).not.toHaveBeenCalled()
    expect(mockDbTransaction).not.toHaveBeenCalled()
  })

  test("rejects an incompatible restored graph before opening a transaction", async () => {
    mockCreateId.mockReturnValue("1")
    const node = sendMessageNodeDefaultFn({})
    node.data.details.beforeStep.channel = "tiktok"
    node.data.details.steps = [sendVideoStepDefaultFn()]

    await expect(
      flowVersionService.restore({
        version: { edges: [], nodes: [node] } as never,
      }),
    ).rejects.toMatchObject({ name: "FlowAuthoringException" })

    expect(mockDbTransaction).not.toHaveBeenCalled()
  })

  test("throws notFoundException when the flow does not exist", async () => {
    mockFlowFindFirst.mockResolvedValue(undefined)

    await expect(
      flowVersionService.publish({
        workspaceId: "ws-1",
        flowId: "missing",
        nodes: [] as never,
        edges: [] as never,
      }),
    ).rejects.toThrow("Flow not found")

    expect(mockDbTransaction).not.toHaveBeenCalled()
  })

  test("throws notFoundException when the flow has no draft version", async () => {
    mockFlowFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      flowVersions: [],
    })

    await expect(
      flowVersionService.publish({
        workspaceId: "ws-1",
        flowId: "flow-1",
        nodes: [] as never,
        edges: [] as never,
      }),
    ).rejects.toThrow("Flow not found")

    expect(mockDbTransaction).not.toHaveBeenCalled()
  })
})

describe("flowVersionService.updateDraftByFlowId", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("saves an in-progress graph without publish validation", async () => {
    vi.spyOn(flowVersionService, "findDraft").mockResolvedValue({
      id: "draft-1",
    } as never)

    await expect(
      flowVersionService.updateDraftByFlowId({
        workspaceId: "ws-1",
        flowId: "flow-1",
        nodes: [{ id: "unsupported-node" }] as never,
        edges: [] as never,
      }),
    ).resolves.toBeUndefined()
  })
})
