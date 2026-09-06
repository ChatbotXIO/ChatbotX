// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateId,
  mockDbTransaction,
  mockEnsureExists,
  mockInsert,
  mockInsertValues,
  mockDispatchAuditRecord,
} = vi.hoisted(() => {
  const mockInsertValues = vi.fn()
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  return {
    mockCreateId: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockEnsureExists: vi.fn().mockResolvedValue(undefined),
    mockInsert,
    mockInsertValues,
    mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
  }
})

const flowModel = { table: "flow" }
const flowAnalyticsSessionModel = { table: "analytics" }
const flowVersionModel = { table: "version" }

const transaction = { insert: mockInsert }

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

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  remapFlowGraphReferences: vi.fn(),
  sendMessageNodeDefaultFn: vi.fn(
    ({ dataProps }: { dataProps: { name: string; isStartNode: boolean } }) => ({
      id: "default-node-1",
      data: dataProps,
    }),
  ),
  FieldOperationType: {
    set: "O01",
    append: "O02",
    prepend: "O03",
    increase: "O04",
    decrease: "O05",
  },
}))

vi.mock("../src/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("../src/flow-version", () => ({
  flowVersionService: { findDraft: vi.fn() },
}))

vi.mock("../src/bot-field/service", () => ({
  botFieldService: { resolveByNameAndType: vi.fn() },
}))

vi.mock("../src/custom-field/service", () => ({
  customFieldService: { resolveByNameAndType: vi.fn() },
}))

vi.mock("../src/folder/service", () => ({
  folderService: { find: vi.fn(), ensureExists: mockEnsureExists },
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { flowService } = await import("../src/flow/service")

describe("flowService.createWithDefaultDraft", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("inserts a flow, an analytics session, and a default draft version in one transaction", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockInsertValues
      .mockReturnValueOnce({
        returning: () => Promise.resolve([{ id: "flow-1" }]),
      })
      .mockReturnValueOnce(Promise.resolve(undefined))
      .mockReturnValueOnce(Promise.resolve(undefined))
    mockCreateId
      .mockReturnValueOnce("flow-1")
      .mockReturnValueOnce("analytics-1")
      .mockReturnValueOnce("version-1")

    const result = await flowService.createWithDefaultDraft({
      workspaceId: "ws-1",
      name: "My Flow",
    })

    expect(result).toEqual({ id: "flow-1" })
    expect(mockInsert).toHaveBeenNthCalledWith(1, flowModel)
    expect(mockInsert).toHaveBeenNthCalledWith(2, flowAnalyticsSessionModel)
    expect(mockInsert).toHaveBeenNthCalledWith(3, flowVersionModel)

    const versionInsertArg = mockInsertValues.mock.calls[2]?.[0] as {
      isDraft: boolean
      startNodeId: string
    }
    expect(versionInsertArg.isDraft).toBe(true)
    expect(versionInsertArg.startNodeId).toBe("default-node-1")

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "create",
      detail: "created a new flow (#flow-1)",
    })
  })

  test("verifies the target folder exists when a folderId is given", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockInsertValues
      .mockReturnValueOnce({
        returning: () => Promise.resolve([{ id: "flow-2" }]),
      })
      .mockReturnValueOnce(Promise.resolve(undefined))
      .mockReturnValueOnce(Promise.resolve(undefined))
    mockCreateId
      .mockReturnValueOnce("flow-2")
      .mockReturnValueOnce("analytics-2")
      .mockReturnValueOnce("version-2")

    await flowService.createWithDefaultDraft({
      workspaceId: "ws-1",
      name: "My Flow",
      folderId: "folder-1",
    })

    expect(mockEnsureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "ws-1",
      folderType: "flow",
    })
  })

  test("does not check folder existence when no folderId is given", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockInsertValues
      .mockReturnValueOnce({
        returning: () => Promise.resolve([{ id: "flow-3" }]),
      })
      .mockReturnValueOnce(Promise.resolve(undefined))
      .mockReturnValueOnce(Promise.resolve(undefined))
    mockCreateId
      .mockReturnValueOnce("flow-3")
      .mockReturnValueOnce("analytics-3")
      .mockReturnValueOnce("version-3")

    await flowService.createWithDefaultDraft({
      workspaceId: "ws-1",
      name: "My Flow",
    })

    expect(mockEnsureExists).not.toHaveBeenCalled()
  })
})
