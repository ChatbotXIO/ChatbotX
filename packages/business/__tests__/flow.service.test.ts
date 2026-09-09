// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockAudit,
  mockCreateId,
  mockDbTransaction,
  mockEnsureExists,
  mockFindDraft,
  mockFlowFindFirst,
  mockInsert,
  mockInsertReturning,
  mockInsertValues,
  mockTopLevelFlowFindFirst,
  mockUpdate,
  mockUpdateSet,
  mockUpdateReturning,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn().mockResolvedValue([{ id: "flow-1" }])
  const mockInsertValues = vi.fn(() =>
    Object.assign(Promise.resolve(undefined), {
      returning: mockInsertReturning,
    }),
  )
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  const mockUpdateReturning = vi.fn()
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }))
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  return {
    mockAudit: vi.fn(),
    mockCreateId: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockEnsureExists: vi.fn(),
    mockFindDraft: vi.fn(),
    mockFlowFindFirst: vi.fn(),
    mockInsert,
    mockInsertReturning,
    mockInsertValues,
    mockTopLevelFlowFindFirst: vi.fn(),
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockUpdateReturning,
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
    insert: mockInsert,
    update: mockUpdate,
    query: {
      flowModel: { findFirst: mockTopLevelFlowFindFirst },
    },
  },
  eq: (...args: unknown[]) => ({ eq: args }),
}))

// The repositories barrel transitively pulls in the contact-filter query
// builders, which read schema models this file does not mock. flowService only
// uses `listIdsByIds` (covered elsewhere), so a stub keeps that chain out.
vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: { listIdsByIds: vi.fn(async () => []) },
  whatsappMessageTemplateRepository: { listIdsByIntegration: vi.fn() },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "0",
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
  sendMessageNodeDefaultFn: vi.fn(() => ({ id: "default-node-1" })),
  // Mirror the REAL runtime values (O01–O05) — a made-up shape would silently
  // mask a failure if flowService ever starts comparing against the enum.
  FieldOperationType: {
    set: "O01",
    append: "O02",
    prepend: "O03",
    increase: "O04",
    decrease: "O05",
  },
  // flowService.list's startType filtering imports stepTypes for the
  // sendWaTemplateMessage branch — this suite never exercises `list`, so a
  // minimal stub (rather than the real enum) keeps the mock self-contained.
  stepTypes: { enum: { sendWaTemplateMessage: "sendWaTemplateMessage" } },
}))

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    audit = mockAudit
  },
}))

vi.mock("../src/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("../src/flow-version", () => ({
  flowVersionService: {
    findDraft: mockFindDraft,
  },
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

describe("flowService.update", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("throws when the flow does not exist in the workspace", async () => {
    mockTopLevelFlowFindFirst.mockResolvedValue(undefined)

    await expect(
      flowService.update(
        { workspaceId: "ws-1", id: "flow-1" },
        { name: "New Name" },
      ),
    ).rejects.toThrow("Flow not found")

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test("no-ops when nothing changed", async () => {
    mockTopLevelFlowFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Welcome",
      active: true,
      enableInInbox: true,
    })

    await flowService.update(
      { workspaceId: "ws-1", id: "flow-1" },
      { name: "Welcome", active: true },
    )

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  test("updates and audits when a field changed", async () => {
    mockTopLevelFlowFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Welcome",
      active: true,
      enableInInbox: true,
    })
    mockUpdateReturning.mockResolvedValue([{ id: "flow-1" }])

    await flowService.update(
      { workspaceId: "ws-1", id: "flow-1" },
      { name: "Onboarding" },
    )

    expect(mockUpdateSet).toHaveBeenCalledWith({ name: "Onboarding" })
    expect(mockAudit).toHaveBeenCalledWith("update", "updated a flow (#flow-1)")
  })
})

describe("flowService.createPublishedDefault", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("inserts a flow, analytics session, draft version, and published version pointing at each other", async () => {
    mockCreateId
      .mockReturnValueOnce("flow-1")
      .mockReturnValueOnce("draft-1")
      .mockReturnValueOnce("published-1")
      .mockReturnValueOnce("analytics-1")
    mockInsertValues.mockResolvedValue(undefined)

    await expect(
      flowService.createPublishedDefault(transaction as never, {
        workspaceId: "ws-1",
        name: "Booking confirmation - Lich_1",
        startNodeId: "node-1",
        nodes: [{ id: "node-1" }] as never,
        edges: [] as never,
      }),
    ).resolves.toEqual({
      flowId: "flow-1",
      draftVersionId: "draft-1",
      publishedVersionId: "published-1",
    })

    expect(mockInsert).toHaveBeenNthCalledWith(1, flowModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(1, {
      id: "flow-1",
      name: "Booking confirmation - Lich_1",
      active: true,
      enableInInbox: false,
      workspaceId: "ws-1",
      folderId: null,
      currentVersionId: "published-1",
      draftVersionId: "draft-1",
    })
    expect(mockInsert).toHaveBeenNthCalledWith(2, flowAnalyticsSessionModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(2, {
      id: "analytics-1",
      flowId: "flow-1",
      workspaceId: "ws-1",
    })
    expect(mockInsert).toHaveBeenNthCalledWith(3, flowVersionModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(3, [
      {
        id: "draft-1",
        workspaceId: "ws-1",
        flowId: "flow-1",
        nodes: [{ id: "node-1" }],
        edges: [],
        isDraft: true,
        isLatest: false,
        startNodeId: "node-1",
      },
      {
        id: "published-1",
        workspaceId: "ws-1",
        flowId: "flow-1",
        nodes: [{ id: "node-1" }],
        edges: [],
        isDraft: false,
        isLatest: true,
        startNodeId: "node-1",
      },
    ])
  })
})

describe("flowService.createDraft", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("checks the folder exists when a folderId is given", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockInsertValues.mockImplementation(() =>
      Object.assign(Promise.resolve(undefined), {
        returning: mockInsertReturning,
      }),
    )
    mockCreateId.mockReturnValue("flow-1")
    mockInsertReturning.mockResolvedValue([{ id: "flow-1" }])

    await flowService.createDraft({
      workspaceId: "ws-1",
      data: { name: "New flow", folderId: "folder-1" },
    })

    expect(mockEnsureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "ws-1",
      folderType: "flow",
    })
  })

  test("inserts the flow, its analytics session, and a draft version with one default start node", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockInsertValues.mockImplementation(() =>
      Object.assign(Promise.resolve(undefined), {
        returning: mockInsertReturning,
      }),
    )
    mockCreateId
      .mockReturnValueOnce("flow-1")
      .mockReturnValueOnce("analytics-1")
      .mockReturnValueOnce("version-1")
    mockInsertReturning.mockResolvedValue([{ id: "flow-1" }])

    const result = await flowService.createDraft({
      workspaceId: "ws-1",
      data: { name: "New flow" },
    })

    expect(mockInsert).toHaveBeenNthCalledWith(1, flowModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(1, {
      id: "flow-1",
      name: "New flow",
      workspaceId: "ws-1",
    })
    expect(mockInsert).toHaveBeenNthCalledWith(2, flowAnalyticsSessionModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(2, {
      id: "analytics-1",
      workspaceId: "ws-1",
      flowId: "flow-1",
    })
    expect(mockInsert).toHaveBeenNthCalledWith(3, flowVersionModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: "version-1",
        workspaceId: "ws-1",
        flowId: "flow-1",
        nodes: [{ id: "default-node-1" }],
        edges: [],
        isDraft: true,
        startNodeId: "default-node-1",
      }),
    )
    expect(mockAudit).toHaveBeenCalledWith(
      "create",
      "created a new flow (#flow-1)",
    )
    expect(result).toEqual({ id: "flow-1" })
  })
})
