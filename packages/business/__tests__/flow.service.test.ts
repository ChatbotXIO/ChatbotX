// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateId,
  mockDbTransaction,
  mockFindDraft,
  mockFlowFindFirst,
  mockInsert,
  mockInsertValues,
} = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  return {
    mockCreateId: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockFindDraft: vi.fn(),
    mockFlowFindFirst: vi.fn(),
    mockInsert,
    mockInsertValues,
  }
})

const flowModel = { table: "flow" }
const flowAnalyticsSessionModel = { table: "analytics" }
const flowVersionModel = { table: "version" }

const transaction = {
  query: {
    flowModel: {
      findFirst: mockFlowFindFirst,
    },
  },
  insert: mockInsert,
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mockDbTransaction,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowAnalyticsSessionModel,
  flowModel,
  flowVersionModel,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {},
}))

vi.mock("../src/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("../src/flow-version", () => ({
  flowVersionService: {
    findDraft: mockFindDraft,
  },
}))

const { flowService } = await import("../src/flow/service")

describe("flowService.duplicate", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("throws when the source flow does not exist in the workspace", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockFlowFindFirst.mockResolvedValue(undefined)

    await expect(
      flowService.duplicate({ workspaceId: "ws-1", id: "flow-1" }),
    ).rejects.toThrow("Flow not found")

    expect(mockFlowFindFirst).toHaveBeenCalledWith({
      where: { id: "flow-1", workspaceId: "ws-1" },
    })
    expect(mockFindDraft).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  test("throws when the source flow has no draft version", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockFlowFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Original flow",
    })
    mockFindDraft.mockResolvedValue(undefined)

    await expect(
      flowService.duplicate({ workspaceId: "ws-1", id: "flow-1" }),
    ).rejects.toThrow("Draft version not found")

    expect(mockFindDraft).toHaveBeenCalledWith(
      { flowId: "flow-1", workspaceId: "ws-1" },
      transaction,
    )
    expect(mockInsert).not.toHaveBeenCalled()
  })

  test("creates an unpublished copy from the draft and returns its id", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockInsertValues.mockResolvedValue(undefined)
    mockFlowFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Original flow",
      active: true,
      enableInInbox: false,
      folderId: "folder-1",
      currentVersionId: "published-1",
      draftVersionId: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-02"),
    })
    mockFindDraft.mockResolvedValue({
      id: "draft-1",
      workspaceId: "ws-1",
      flowId: "flow-1",
      nodes: [{ id: "node-1" }],
      edges: [{ id: "edge-1" }],
      isDraft: true,
      isLatest: false,
      startNodeId: "node-1",
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-02"),
    })
    // Source id order: new flow id → draft version id → analytics session id.
    mockCreateId
      .mockReturnValueOnce("flow-copy-1")
      .mockReturnValueOnce("draft-copy-1")
      .mockReturnValueOnce("analytics-1")

    await expect(
      flowService.duplicate({ workspaceId: "ws-1", id: "flow-1" }),
    ).resolves.toBe("flow-copy-1")

    expect(mockInsert).toHaveBeenNthCalledWith(1, flowModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(1, {
      id: "flow-copy-1",
      name: "Original flow _copy",
      active: true,
      enableInInbox: false,
      workspaceId: "ws-1",
      folderId: "folder-1",
      currentVersionId: null,
      draftVersionId: "draft-copy-1",
    })
    expect(mockInsert).toHaveBeenNthCalledWith(2, flowAnalyticsSessionModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(2, {
      id: "analytics-1",
      flowId: "flow-copy-1",
      workspaceId: "ws-1",
    })
    expect(mockInsert).toHaveBeenNthCalledWith(3, flowVersionModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(3, {
      id: "draft-copy-1",
      workspaceId: "ws-1",
      flowId: "flow-copy-1",
      nodes: [{ id: "node-1" }],
      edges: [{ id: "edge-1" }],
      isDraft: true,
      isLatest: false,
      startNodeId: "node-1",
    })
  })

  test("propagates insert failures so the transaction can roll back", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockFlowFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Original flow",
      active: true,
      enableInInbox: true,
      folderId: null,
    })
    mockFindDraft.mockResolvedValue({
      id: "draft-1",
      workspaceId: "ws-1",
      flowId: "flow-1",
      nodes: [{ id: "node-1" }],
      edges: [],
      isDraft: true,
      isLatest: false,
      startNodeId: "node-1",
    })
    mockCreateId.mockReturnValue("flow-copy-1")
    mockInsertValues.mockRejectedValueOnce(new Error("insert failed"))

    await expect(
      flowService.duplicate({ workspaceId: "ws-1", id: "flow-1" }),
    ).rejects.toThrow("insert failed")

    expect(mockInsert).toHaveBeenCalledTimes(1)
  })
})
