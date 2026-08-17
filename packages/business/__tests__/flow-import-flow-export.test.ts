// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateId,
  mockDbTransaction,
  mockInsert,
  mockInsertValues,
  mockResolveByNameAndType,
  mockRemapCustomFieldReferences,
  mockFolderFind,
} = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  return {
    mockCreateId: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockInsert,
    mockInsertValues,
    mockResolveByNameAndType: vi.fn(),
    mockRemapCustomFieldReferences: vi.fn(),
    mockFolderFind: vi.fn(),
  }
})

const flowModel = { table: "flow" }
const flowAnalyticsSessionModel = { table: "analytics" }
const flowVersionModel = { table: "version" }

const transaction = {
  query: { flowModel: { findFirst: vi.fn() } },
  insert: mockInsert,
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mockDbTransaction },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "0",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowAnalyticsSessionModel,
  flowModel,
  flowVersionModel,
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  remapCustomFieldReferences: mockRemapCustomFieldReferences,
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
  flowVersionService: { findDraft: vi.fn() },
}))

vi.mock("../src/custom-field/service", () => ({
  customFieldService: { resolveByNameAndType: mockResolveByNameAndType },
}))

vi.mock("../src/folder/service", () => ({
  folderService: { find: mockFolderFind },
}))

const { flowService } = await import("../src/flow/service")

describe("flowService.importFlowExport", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("resolves the manifest, remaps references, and inserts the flow in one transaction", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockResolveByNameAndType.mockResolvedValue({
      idMap: new Map([["date:birthday", "target-42"]]),
      createdIds: ["target-42"],
    })
    mockRemapCustomFieldReferences.mockReturnValue({
      nodes: [{ id: "1", inputFieldId: "target-42" }],
      edges: [],
    })
    mockCreateId
      .mockReturnValueOnce("new-flow-id")
      .mockReturnValueOnce("draft-version-id")
      .mockReturnValueOnce("analytics-id")

    const result = await flowService.importFlowExport({
      workspaceId: "ws-1",
      name: "Onboarding",
      active: true,
      enableInInbox: true,
      startNodeId: "1",
      nodes: [{ id: "1", inputFieldId: "source-42" }] as never,
      edges: [] as never,
      customFields: { "source-42": { name: "Birthday", type: "date" } },
    })

    expect(mockResolveByNameAndType).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fields: [{ name: "Birthday", type: "date" }],
      tx: transaction,
    })
    expect(mockRemapCustomFieldReferences).toHaveBeenCalledWith(
      { nodes: [{ id: "1", inputFieldId: "source-42" }], edges: [] },
      new Map([["source-42", "target-42"]]),
    )
    expect(result).toEqual({
      flowId: "new-flow-id",
      createdCustomFieldIds: ["target-42"],
    })
    // The remapped graph is not returned to the caller, so assert it reaches
    // the version row instead — that write is the only consumer.
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        flowId: "new-flow-id",
        nodes: [{ id: "1", inputFieldId: "target-42" }],
        edges: [],
      }),
    )
  })

  test("an empty manifest short-circuits resolution: nodes pass through unmapped", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapCustomFieldReferences.mockImplementation((flow) => flow)
    mockCreateId
      .mockReturnValueOnce("new-flow-id")
      .mockReturnValueOnce("draft-version-id")
      .mockReturnValueOnce("analytics-id")

    const nodes = [{ id: "1" }] as never
    const result = await flowService.importFlowExport({
      workspaceId: "ws-1",
      name: "Onboarding",
      active: true,
      enableInInbox: true,
      startNodeId: "1",
      nodes,
      edges: [] as never,
      customFields: {},
    })

    expect(mockResolveByNameAndType).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fields: [],
      tx: transaction,
    })
    expect(result.createdCustomFieldIds).toEqual([])
  })

  test("a failed flow insert rolls back and leaves no orphaned custom fields (whole call rejects)", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockResolveByNameAndType.mockResolvedValue({
      idMap: new Map([["date:birthday", "target-42"]]),
      createdIds: ["target-42"],
    })
    mockRemapCustomFieldReferences.mockReturnValue({ nodes: [], edges: [] })
    mockCreateId.mockReturnValue("new-flow-id")
    mockInsertValues.mockRejectedValueOnce(new Error("insert failed"))

    await expect(
      flowService.importFlowExport({
        workspaceId: "ws-1",
        name: "Onboarding",
        active: true,
        enableInInbox: true,
        startNodeId: "1",
        nodes: [] as never,
        edges: [] as never,
        customFields: { "source-42": { name: "Birthday", type: "date" } },
      }),
    ).rejects.toThrow("insert failed")

    // The transaction callback threw, so the caller (db.transaction mock's
    // real implementation would roll back here) never receives a result —
    // resolveByNameAndType's writes and the flow insert live in the same tx.
    expect(mockResolveByNameAndType).toHaveBeenCalledWith(
      expect.objectContaining({ tx: transaction }),
    )
  })

  test("a valid folder id is resolved and persisted on the flow insert", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapCustomFieldReferences.mockImplementation((flow) => flow)
    mockFolderFind.mockResolvedValue({ id: "folder-1" })
    mockCreateId
      .mockReturnValueOnce("new-flow-id")
      .mockReturnValueOnce("draft-version-id")
      .mockReturnValueOnce("analytics-id")

    await flowService.importFlowExport({
      workspaceId: "ws-1",
      name: "Onboarding",
      active: true,
      enableInInbox: true,
      startNodeId: "1",
      nodes: [] as never,
      edges: [] as never,
      customFields: {},
      folderId: "folder-1",
    })

    expect(mockFolderFind).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "ws-1",
      folderType: "flow",
      tx: transaction,
    })
    expect(mockInsertValues.mock.calls[0][0]).toEqual(
      expect.objectContaining({ folderId: "folder-1" }),
    )
  })

  test("a folder missing in the workspace falls back to null without failing the import", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapCustomFieldReferences.mockImplementation((flow) => flow)
    mockFolderFind.mockResolvedValue(undefined)
    mockCreateId
      .mockReturnValueOnce("new-flow-id")
      .mockReturnValueOnce("draft-version-id")
      .mockReturnValueOnce("analytics-id")

    await flowService.importFlowExport({
      workspaceId: "ws-1",
      name: "Onboarding",
      active: true,
      enableInInbox: true,
      startNodeId: "1",
      nodes: [] as never,
      edges: [] as never,
      customFields: {},
      folderId: "deleted-folder",
    })

    expect(mockInsertValues.mock.calls[0][0]).toEqual(
      expect.objectContaining({ folderId: null }),
    )
  })

  test("the root folder sentinel skips the lookup and persists null", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapCustomFieldReferences.mockImplementation((flow) => flow)
    mockCreateId
      .mockReturnValueOnce("new-flow-id")
      .mockReturnValueOnce("draft-version-id")
      .mockReturnValueOnce("analytics-id")

    await flowService.importFlowExport({
      workspaceId: "ws-1",
      name: "Onboarding",
      active: true,
      enableInInbox: true,
      startNodeId: "1",
      nodes: [] as never,
      edges: [] as never,
      customFields: {},
      folderId: "0",
    })

    expect(mockFolderFind).not.toHaveBeenCalled()
    expect(mockInsertValues.mock.calls[0][0]).toEqual(
      expect.objectContaining({ folderId: null }),
    )
  })

  test("an omitted folder id skips the lookup and persists null", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapCustomFieldReferences.mockImplementation((flow) => flow)
    mockCreateId
      .mockReturnValueOnce("new-flow-id")
      .mockReturnValueOnce("draft-version-id")
      .mockReturnValueOnce("analytics-id")

    await flowService.importFlowExport({
      workspaceId: "ws-1",
      name: "Onboarding",
      active: true,
      enableInInbox: true,
      startNodeId: "1",
      nodes: [] as never,
      edges: [] as never,
      customFields: {},
    })

    expect(mockFolderFind).not.toHaveBeenCalled()
    expect(mockInsertValues.mock.calls[0][0]).toEqual(
      expect.objectContaining({ folderId: null }),
    )
  })
})
