// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateId,
  mockInsert,
  mockInsertValues,
  mockInsertReturning,
  mockWebhookFindMany,
  mockDelete,
  mockUpdateWebhookCache,
  mockRemoveWebhookCache,
  mockEnsureExists,
  mockWebhookFindFirst,
  mockUpdateReturning,
  mockDbUpdate,
  mockDispatchAuditRecord,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockInsertReturning })
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues })
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere })
  const mockUpdateReturning = vi.fn()
  const mockUpdateWhere = vi
    .fn()
    .mockReturnValue({ returning: mockUpdateReturning })
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
  const mockDbUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

  return {
    mockCreateId: vi.fn(() => "generated-id"),
    mockInsert,
    mockInsertValues,
    mockInsertReturning,
    mockWebhookFindMany: vi.fn(),
    mockDelete,
    mockUpdateWebhookCache: vi.fn().mockResolvedValue(undefined),
    mockRemoveWebhookCache: vi.fn().mockResolvedValue(undefined),
    mockEnsureExists: vi.fn().mockResolvedValue(undefined),
    mockWebhookFindFirst: vi.fn(),
    mockUpdateReturning,
    mockDbUpdate,
    mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: mockInsert,
    delete: mockDelete,
    update: mockDbUpdate,
    $count: vi.fn(),
    query: {
      webhookModel: {
        findMany: mockWebhookFindMany,
        findFirst: mockWebhookFindFirst,
      },
    },
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  conditionModel: {},
  webhookModel: {
    id: "webhookModel.id",
    workspaceId: "webhookModel.workspaceId",
  },
}))

vi.mock("@chatbotx.io/events", () => ({
  updateWebhookCache: mockUpdateWebhookCache,
  removeWebhookCache: mockRemoveWebhookCache,
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: vi.fn() },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("../src/net/ssrf-guard", () => ({
  assertPublicUrl: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: mockEnsureExists },
}))

vi.mock("../src/trigger/condition-columns", () => ({
  toConditionColumnsShared: (condition: {
    type: string
    sourceId?: string | null
    operator?: string | null
    value?: unknown
  }) => ({
    type: condition.type,
    sourceId: condition.sourceId ?? null,
    operator: condition.operator ?? null,
    value: condition.value ?? null,
  }),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { webhookService } = await import("../src/webhook/service")

const WS = "ws-1"

describe("webhookService.createDraft", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("inserts with an empty url and refreshes the cache", async () => {
    mockInsertReturning.mockResolvedValue([{ id: "webhook-1", url: "" }])

    const result = await webhookService.createDraft({
      workspaceId: WS,
      name: "My Webhook",
    })

    expect(result).toEqual({ id: "webhook-1", url: "" })
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ url: "", workspaceId: WS }),
    )
    expect(mockUpdateWebhookCache).toHaveBeenCalledWith(WS)
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "create",
      detail: "created a new webhook (#webhook-1)",
    })
  })

  test("verifies the folder exists when a folderId is given", async () => {
    mockInsertReturning.mockResolvedValue([{ id: "webhook-2", url: "" }])

    await webhookService.createDraft({
      workspaceId: WS,
      name: "My Webhook",
      folderId: "folder-1",
    })

    expect(mockEnsureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: WS,
      folderType: "webhook",
    })
  })
})

describe("webhookService.deleteMany", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("pluralizes the audit detail for multiple ids", async () => {
    mockWebhookFindMany.mockResolvedValue([
      { id: "webhook-1" },
      { id: "webhook-2" },
    ])

    await webhookService.deleteMany({
      workspaceId: WS,
      ids: ["webhook-1", "webhook-2"],
    })

    expect(mockDelete).toHaveBeenCalled()
    expect(mockRemoveWebhookCache).toHaveBeenCalledWith(WS)
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "delete",
      detail: "deleted webhooks (#webhook-1, #webhook-2)",
    })
  })

  test("does not pluralize for a single id", async () => {
    mockWebhookFindMany.mockResolvedValue([{ id: "webhook-1" }])

    await webhookService.deleteMany({ workspaceId: WS, ids: ["webhook-1"] })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "delete",
      detail: "deleted webhook (#webhook-1)",
    })
  })

  test("does not audit when no rows matched", async () => {
    mockWebhookFindMany.mockResolvedValue([])

    await webhookService.deleteMany({ workspaceId: WS, ids: ["missing"] })

    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("webhookService.updateSettings", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("throws notFoundException when the webhook does not exist", async () => {
    mockWebhookFindFirst.mockResolvedValue(undefined)

    await expect(
      webhookService.updateSettings({
        workspaceId: WS,
        id: "webhook-1",
        name: "New",
      }),
    ).rejects.toThrow("Webhook not found")
  })

  test("early-returns without writing when nothing changed", async () => {
    mockWebhookFindFirst.mockResolvedValue({
      id: "webhook-1",
      name: "Same",
      active: true,
    })

    await webhookService.updateSettings({
      workspaceId: WS,
      id: "webhook-1",
      name: "Same",
    })

    expect(mockDbUpdate).not.toHaveBeenCalled()
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("updates, refreshes cache, and audits when something changed", async () => {
    mockWebhookFindFirst.mockResolvedValue({
      id: "webhook-1",
      name: "Old",
      active: true,
    })
    mockUpdateReturning.mockResolvedValue([{ id: "webhook-1" }])

    await webhookService.updateSettings({
      workspaceId: WS,
      id: "webhook-1",
      name: "New",
    })

    expect(mockUpdateWebhookCache).toHaveBeenCalledWith(WS)
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: "updated a webhook (#webhook-1)",
    })
  })
})
