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
  mockInvalidateList,
  mockListPublishedOptions,
  mockTopLevelFlowFindFirst,
  mockUpdate,
  mockUpdateSet,
  mockUpdateReturning,
  mockAssertFlowGraphPublishable,
  mockEnqueueSync,
  mockEnqueueDelete,
  mockFlowFindMany,
  mockAssertDeletable,
  mockAssertEditable,
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
    mockInvalidateList: vi.fn(),
    mockListPublishedOptions: vi.fn(),
    mockTopLevelFlowFindFirst: vi.fn(),
    mockUpdate,
    mockUpdateSet,
    mockUpdateReturning,
    mockAssertFlowGraphPublishable: vi.fn(),
    mockEnqueueSync: vi.fn(),
    mockEnqueueDelete: vi.fn(),
    mockFlowFindMany: vi.fn(),
    mockAssertDeletable: vi.fn(),
    mockAssertEditable: vi.fn(),
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
      flowModel: {
        findFirst: mockTopLevelFlowFindFirst,
        findMany: mockFlowFindMany,
      },
    },
  },
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
}))

// The repositories barrel transitively pulls in the contact-filter query
// builders, which read schema models this file does not mock. flowService only
// uses `listIdsByIds` (covered elsewhere), so a stub keeps that chain out.
vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: {
    listIdsByIds: vi.fn(async () => []),
    listPublishedOptions: mockListPublishedOptions,
  },
  reflinkRepository: { listIdsByFlowIds: vi.fn(async () => []) },
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
  assertFlowGraphPublishable: mockAssertFlowGraphPublishable,
  flowVersionService: {
    findDraft: mockFindDraft,
    invalidateList: mockInvalidateList,
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

vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    useTransaction: true,
    assertDeletable: mockAssertDeletable,
    assertResourceEditable: mockAssertEditable,
  }),
  changedKeysOf: vi.fn(() => []),
}))

const mockLockOptions = vi.hoisted(() => vi.fn())

// Run the locked transaction against the same mocked client the test asserts on.
vi.mock("../src/template/template-resource-locks", async () => {
  const { db } = await import("@chatbotx.io/database/client")
  return {
    withTemplateLockedTransaction: (
      run: (tx: unknown) => unknown,
      options?: unknown,
    ) => {
      mockLockOptions(options)
      return run(db)
    },
  }
})

vi.mock("../src/messenger-welcome-message-flow/service", () => ({
  messengerWelcomeMessageFlowService: {
    enqueueSync: mockEnqueueSync,
    enqueueDelete: mockEnqueueDelete,
  },
}))

const { flowService } = await import("../src/flow/service")

describe("flowService.listPublishedOptions", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("delegates the workspace-scoped options read to the repository", async () => {
    mockListPublishedOptions.mockResolvedValue([
      { id: "flow-1", name: "Welcome" },
    ])

    await expect(
      flowService.listPublishedOptions({ workspaceId: "ws-1" }),
    ).resolves.toEqual([{ id: "flow-1", name: "Welcome" }])
    expect(mockListPublishedOptions).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    })
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

  test("locks the flow before the stored row is read, then diffs the fresh row", async () => {
    mockTopLevelFlowFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Welcome",
      active: true,
      enableInInbox: true,
    })
    mockUpdateReturning.mockResolvedValue([{ id: "flow-1" }])
    mockTopLevelFlowFindFirst.mockClear()
    mockLockOptions.mockClear()

    await flowService.update(
      { workspaceId: "ws-1", id: "flow-1" },
      { name: "Renamed" },
    )

    expect(mockLockOptions).toHaveBeenCalledWith({
      workspaceId: expect.any(String),
      initialKeys: [{ kind: "flow", resourceId: "flow-1" }],
    })
    expect(mockLockOptions.mock.invocationCallOrder[0]).toBeLessThan(
      mockTopLevelFlowFindFirst.mock.invocationCallOrder[0] as number,
    )
    expect(mockAssertEditable).toHaveBeenCalledWith(
      expect.objectContaining({ changedKeys: ["name"] }),
    )
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

  test("a rename of a locked template copy is refused before any write", async () => {
    mockTopLevelFlowFindFirst.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Welcome",
      active: true,
      enableInInbox: true,
    })
    mockAssertEditable.mockRejectedValueOnce(
      Object.assign(new Error("locked"), {
        code: "templateAllowEditViolation",
      }),
    )

    await expect(
      flowService.update(
        { workspaceId: "ws-1", id: "flow-1" },
        { name: "Renamed" },
      ),
    ).rejects.toMatchObject({ code: "templateAllowEditViolation" })

    expect(mockAssertEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "flow",
        resourceIds: ["flow-1"],
        changedKeys: ["name"],
      }),
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test("takes the guard first, inside the locked transaction, before the write", async () => {
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

    const guardArgs = mockAssertEditable.mock.calls[0]?.[0] as {
      tx?: unknown
    }
    expect(guardArgs.tx).toBeDefined()
    expect(mockAssertEditable.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpdate.mock.invocationCallOrder[0] as number,
    )
    // The rename sync is queued after the transaction, not inside it.
    expect(mockEnqueueSync.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockUpdateReturning.mock.invocationCallOrder[0] as number,
    )
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

  test("uses a pre-resolved graph instead of the default start node when one is supplied", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockInsertValues.mockImplementation(() =>
      Object.assign(Promise.resolve(undefined), {
        returning: mockInsertReturning,
      }),
    )
    mockCreateId
      .mockReturnValueOnce("flow-2")
      .mockReturnValueOnce("analytics-2")
      .mockReturnValueOnce("version-2")
    mockInsertReturning.mockResolvedValue([{ id: "flow-2" }])

    const result = await flowService.createDraft({
      workspaceId: "ws-1",
      data: { name: "New flow" },
      graph: {
        nodes: [{ id: "node-1" }],
        edges: [{ id: "e1", source: "node-1", target: "node-1" }],
        startNodeId: "node-1",
      },
    })

    expect(mockInsert).toHaveBeenNthCalledWith(3, flowVersionModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: "version-2",
        workspaceId: "ws-1",
        flowId: "flow-2",
        nodes: [{ id: "node-1" }],
        edges: [{ id: "e1", source: "node-1", target: "node-1" }],
        isDraft: true,
        startNodeId: "node-1",
      }),
    )
    expect(result).toEqual({ id: "flow-2" })
  })

  test("creates a draft with an in-progress graph without publish validation", async () => {
    mockAssertFlowGraphPublishable.mockImplementationOnce(() => {
      throw new Error("Draft graph is not publishable")
    })
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockInsertValues.mockImplementation(() =>
      Object.assign(Promise.resolve(undefined), {
        returning: mockInsertReturning,
      }),
    )
    mockCreateId
      .mockReturnValueOnce("flow-3")
      .mockReturnValueOnce("analytics-3")
      .mockReturnValueOnce("version-3")
    mockInsertReturning.mockResolvedValue([{ id: "flow-3" }])

    await expect(
      flowService.createDraft({
        workspaceId: "ws-1",
        data: { name: "New flow" },
        graph: {
          nodes: [{ id: "unsupported-node" }],
          edges: [],
          startNodeId: "unsupported-node",
        },
      }),
    ).resolves.toEqual({ id: "flow-3" })
    mockAssertFlowGraphPublishable.mockReset()
  })
})

describe("flowService.createPublished", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("checks the folder exists before opening the transaction", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockInsertValues.mockResolvedValue(undefined)
    mockCreateId
      .mockReturnValueOnce("flow-1")
      .mockReturnValueOnce("draft-1")
      .mockReturnValueOnce("published-1")
      .mockReturnValueOnce("analytics-1")

    await flowService.createPublished({
      workspaceId: "ws-1",
      data: { name: "New flow", folderId: "folder-1" },
      graph: {
        nodes: [{ id: "node-1" }] as never,
        edges: [] as never,
        startNodeId: "node-1",
      },
    })

    expect(mockEnsureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "ws-1",
      folderType: "flow",
    })
  })

  test("inserts flow + draft + published version in one transaction, invalidates the versions cache, and audits", async () => {
    mockDbTransaction.mockImplementation(async (callback) =>
      callback(transaction),
    )
    mockInsertValues.mockResolvedValue(undefined)
    mockCreateId
      .mockReturnValueOnce("flow-1")
      .mockReturnValueOnce("draft-1")
      .mockReturnValueOnce("published-1")
      .mockReturnValueOnce("analytics-1")

    const result = await flowService.createPublished({
      workspaceId: "ws-1",
      data: { name: "New flow" },
      graph: {
        nodes: [{ id: "node-1" }] as never,
        edges: [] as never,
        startNodeId: "node-1",
      },
    })

    expect(result).toEqual({ id: "flow-1" })
    expect(mockDbTransaction).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenNthCalledWith(3, flowVersionModel)
    expect(mockInsertValues).toHaveBeenNthCalledWith(3, [
      expect.objectContaining({
        id: "draft-1",
        isDraft: true,
        isLatest: false,
      }),
      expect.objectContaining({
        id: "published-1",
        isDraft: false,
        isLatest: true,
      }),
    ])
    expect(mockInvalidateList).toHaveBeenCalledWith("flow-1")
    expect(mockAudit).toHaveBeenCalledWith(
      "create",
      "created a new flow (#flow-1)",
    )
  })
})

describe("flowService welcome message flow sync hooks", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const existing = {
    id: "flow-1",
    workspaceId: "ws-1",
    name: "Welcome",
    active: true,
    enableInInbox: true,
  }

  test("update enqueues a rename sync when the name changes", async () => {
    mockTopLevelFlowFindFirst.mockResolvedValue(existing)
    mockUpdateReturning.mockResolvedValue([{ id: "flow-1" }])

    await flowService.update(
      { workspaceId: "ws-1", id: "flow-1" },
      { name: "Onboarding" },
    )

    expect(mockEnqueueSync).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowId: "flow-1",
      reason: "rename",
    })
  })

  test("update without a name change does not enqueue", async () => {
    mockTopLevelFlowFindFirst.mockResolvedValue(existing)
    mockUpdateReturning.mockResolvedValue([{ id: "flow-1" }])

    await flowService.update(
      { workspaceId: "ws-1", id: "flow-1" },
      { name: "Welcome", active: false },
    )

    expect(mockUpdateSet).toHaveBeenCalled()
    expect(mockEnqueueSync).not.toHaveBeenCalled()
  })

  test("createPublished enqueues a publish sync for the new flow", async () => {
    mockDbTransaction.mockResolvedValue({ flowId: "flow-9" })

    await flowService.createPublished({
      workspaceId: "ws-1",
      data: { name: "New flow" },
      graph: {
        nodes: [{ id: "node-1" }] as never,
        edges: [] as never,
        startNodeId: "node-1",
      },
    })

    expect(mockEnqueueSync).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowId: "flow-9",
      reason: "publish",
    })
  })

  test("deleteMany enqueues one delete job for the deleted ids after commit", async () => {
    mockFlowFindMany.mockResolvedValue([{ id: "flow-2" }, { id: "flow-3" }])
    mockDbTransaction.mockResolvedValue(undefined)

    await flowService.deleteMany({
      workspaceId: "ws-1",
      ids: ["flow-2", "flow-3", "flow-404"],
    })

    expect(mockEnqueueDelete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowIds: ["flow-2", "flow-3"],
    })
    expect(mockDbTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnqueueDelete.mock.invocationCallOrder[0],
    )
  })

  test("deleteMany with no matching flows does not enqueue", async () => {
    mockFlowFindMany.mockResolvedValue([])

    await flowService.deleteMany({ workspaceId: "ws-1", ids: ["flow-404"] })

    expect(mockEnqueueDelete).not.toHaveBeenCalled()
  })
})
