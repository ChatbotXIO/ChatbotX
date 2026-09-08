// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateId,
  mockDbTransaction,
  mockInsert,
  mockInsertValues,
  mockResolveByNameAndType,
  mockBotFieldResolveByNameAndType,
  mockRemapFlowGraphReferences,
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
    mockBotFieldResolveByNameAndType: vi.fn(),
    mockRemapFlowGraphReferences: vi.fn(),
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

vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: { listIdsByIds: vi.fn() },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowAnalyticsSessionModel,
  flowModel,
  flowVersionModel,
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  remapFlowGraphReferences: mockRemapFlowGraphReferences,
  sendMessageNodeDefaultFn: vi.fn(() => ({ id: "default-node" })),
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

vi.mock("../src/bot-field/service", () => ({
  botFieldService: { resolveByNameAndType: mockBotFieldResolveByNameAndType },
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
    mockBotFieldResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapFlowGraphReferences.mockReturnValue({
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
      botFields: {},
    })

    expect(mockResolveByNameAndType).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fields: [{ name: "Birthday", type: "date" }],
      tx: transaction,
    })
    expect(mockBotFieldResolveByNameAndType).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fields: [],
      tx: transaction,
    })
    expect(mockRemapFlowGraphReferences).toHaveBeenCalledWith(
      { nodes: [{ id: "1", inputFieldId: "source-42" }], edges: [] },
      {
        customField: new Map([["source-42", "target-42"]]),
        botField: new Map(),
      },
      { kinds: ["customField", "botField"] },
    )
    expect(result).toEqual({
      flowId: "new-flow-id",
      createdCustomFieldIds: ["target-42"],
      createdBotFieldIds: [],
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

  test("resolves a bot field manifest entry into idMaps.botField", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockBotFieldResolveByNameAndType.mockResolvedValue({
      idMap: new Map([["number:loyalty points", "target-bot-7"]]),
      createdIds: ["target-bot-7"],
    })
    mockRemapFlowGraphReferences.mockReturnValue({
      nodes: [{ id: "1", inputFieldId: "bot_field:target-bot-7" }],
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
      nodes: [{ id: "1", inputFieldId: "bot_field:source-7" }] as never,
      edges: [] as never,
      customFields: {},
      botFields: { "source-7": { name: "Loyalty Points", type: "number" } },
    })

    expect(mockBotFieldResolveByNameAndType).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fields: [{ name: "Loyalty Points", type: "number" }],
      tx: transaction,
    })
    expect(mockRemapFlowGraphReferences).toHaveBeenCalledWith(
      { nodes: [{ id: "1", inputFieldId: "bot_field:source-7" }], edges: [] },
      {
        customField: new Map(),
        botField: new Map([["source-7", "target-bot-7"]]),
      },
      { kinds: ["customField", "botField"] },
    )
    expect(result.createdBotFieldIds).toEqual(["target-bot-7"])
  })

  test("an empty manifest short-circuits resolution: nodes pass through unmapped", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockBotFieldResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapFlowGraphReferences.mockImplementation((flow) => flow)
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
      botFields: {},
    })

    expect(mockResolveByNameAndType).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fields: [],
      tx: transaction,
    })
    expect(mockBotFieldResolveByNameAndType).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fields: [],
      tx: transaction,
    })
    expect(result.createdCustomFieldIds).toEqual([])
    expect(result.createdBotFieldIds).toEqual([])
  })

  test("a failed flow insert rolls back and leaves no orphaned custom fields (whole call rejects)", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockResolveByNameAndType.mockResolvedValue({
      idMap: new Map([["date:birthday", "target-42"]]),
      createdIds: ["target-42"],
    })
    mockBotFieldResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapFlowGraphReferences.mockReturnValue({ nodes: [], edges: [] })
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
        botFields: {},
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
    mockBotFieldResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapFlowGraphReferences.mockImplementation((flow) => flow)
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
      botFields: {},
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
    mockBotFieldResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapFlowGraphReferences.mockImplementation((flow) => flow)
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
      botFields: {},
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
    mockBotFieldResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapFlowGraphReferences.mockImplementation((flow) => flow)
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
      botFields: {},
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
    mockBotFieldResolveByNameAndType.mockResolvedValue({
      idMap: new Map(),
      createdIds: [],
    })
    mockRemapFlowGraphReferences.mockImplementation((flow) => flow)
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
      botFields: {},
    })

    expect(mockFolderFind).not.toHaveBeenCalled()
    expect(mockInsertValues.mock.calls[0][0]).toEqual(
      expect.objectContaining({ folderId: null }),
    )
  })
})
