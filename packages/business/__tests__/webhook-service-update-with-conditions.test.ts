// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateId,
  mockDbTransaction,
  mockConditionFindMany,
  mockWebhookFindFirst,
  mockTxUpdate,
  mockTxUpdateSet,
  mockTxDelete,
  mockTxDeleteWhere,
  mockTxInsert,
  mockTxInsertValues,
  mockUpdateWebhookCache,
  mockDispatchAuditRecord,
} = vi.hoisted(() => {
  const mockTxUpdateWhere = vi.fn().mockResolvedValue(undefined)
  const mockTxUpdateSet = vi.fn().mockReturnValue({ where: mockTxUpdateWhere })
  const mockTxUpdate = vi.fn().mockReturnValue({ set: mockTxUpdateSet })
  const mockTxDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockTxDelete = vi.fn().mockReturnValue({ where: mockTxDeleteWhere })
  const mockTxInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockTxInsert = vi.fn().mockReturnValue({ values: mockTxInsertValues })

  return {
    mockCreateId: vi.fn(() => "new-condition-id"),
    mockDbTransaction: vi.fn(),
    mockConditionFindMany: vi.fn(),
    mockWebhookFindFirst: vi.fn(),
    mockTxUpdate,
    mockTxUpdateSet,
    mockTxDelete,
    mockTxDeleteWhere,
    mockTxInsert,
    mockTxInsertValues,
    mockUpdateWebhookCache: vi.fn().mockResolvedValue(undefined),
    mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
  }
})

const tx = {
  query: {
    conditionModel: { findMany: mockConditionFindMany },
    webhookModel: { findFirst: mockWebhookFindFirst },
  },
  update: mockTxUpdate,
  delete: mockTxDelete,
  insert: mockTxInsert,
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mockDbTransaction },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  conditionModel: { id: "conditionModel.id" },
  webhookModel: {
    id: "webhookModel.id",
    workspaceId: "webhookModel.workspaceId",
  },
}))

vi.mock("@chatbotx.io/events", () => ({
  removeWebhookCache: vi.fn(),
  updateWebhookCache: mockUpdateWebhookCache,
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: vi.fn(
    async (_key: string, fn: () => Promise<unknown>) => await fn(),
  ),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: vi.fn() },
}))

vi.mock("../src/net/ssrf-guard", () => ({
  assertPublicUrl: vi.fn(),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { webhookService } = await import("../src/webhook/service")

const WS = "ws-1"
const WEBHOOK_ID = "webhook-1"
const URL = "https://example.com/hook"

describe("webhookService.updateWithConditions", () => {
  beforeEach(() => {
    mockDbTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test("partitions conditions into delete/update/create and applies each", async () => {
    mockConditionFindMany.mockResolvedValue([
      {
        id: "cond-keep",
        type: "tagApplied",
        sourceId: "tag-old",
        operator: null,
        value: null,
      },
      {
        id: "cond-delete",
        type: "tagApplied",
        sourceId: "tag-2",
        operator: null,
        value: null,
      },
    ])
    mockWebhookFindFirst.mockResolvedValue({ id: WEBHOOK_ID })

    await webhookService.updateWithConditions({
      workspaceId: WS,
      id: WEBHOOK_ID,
      url: URL,
      conditions: [
        {
          id: "cond-keep",
          type: "tagApplied",
          sourceId: "tag-new",
        },
        { type: "newContact" },
      ],
    })

    // deletes the condition not resubmitted
    expect(mockTxDelete).toHaveBeenCalledWith({ id: "conditionModel.id" })
    expect(mockTxDeleteWhere).toHaveBeenCalledWith({
      inArray: ["conditionModel.id", ["cond-delete"]],
    })

    // updates the resubmitted condition unconditionally — no isSameJsonValue
    // diff-skip, unlike triggerService.updateWithConditions
    expect(mockTxUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "tag-new" }),
    )

    // creates the new condition
    expect(mockTxInsertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "new-condition-id",
        webhookId: WEBHOOK_ID,
        type: "newContact",
      }),
    ])
  })

  test("updates every resubmitted condition unconditionally, even when nothing changed", async () => {
    mockConditionFindMany.mockResolvedValue([
      {
        id: "cond-unchanged",
        type: "tagApplied",
        sourceId: "tag-same",
        operator: null,
        value: null,
      },
    ])
    mockWebhookFindFirst.mockResolvedValue({ id: WEBHOOK_ID })

    await webhookService.updateWithConditions({
      workspaceId: WS,
      id: WEBHOOK_ID,
      url: URL,
      conditions: [
        { id: "cond-unchanged", type: "tagApplied", sourceId: "tag-same" },
      ],
    })

    // Unlike triggerService, webhookService has no isSameJsonValue diff-skip
    // — a resubmitted condition is always re-written.
    expect(mockTxUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "tag-same" }),
    )
  })

  test("always refreshes the cache, regardless of whether anything changed", async () => {
    mockConditionFindMany.mockResolvedValue([])
    mockWebhookFindFirst.mockResolvedValue({ id: WEBHOOK_ID })

    await webhookService.updateWithConditions({
      workspaceId: WS,
      id: WEBHOOK_ID,
      url: URL,
      conditions: [],
    })

    expect(mockUpdateWebhookCache).toHaveBeenCalledWith(WS)
  })

  test("audits only when the webhook row is found (if (result) gate)", async () => {
    mockConditionFindMany.mockResolvedValue([])
    mockWebhookFindFirst.mockResolvedValue({ id: WEBHOOK_ID })

    await webhookService.updateWithConditions({
      workspaceId: WS,
      id: WEBHOOK_ID,
      url: URL,
      conditions: [],
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: `updated a webhook (#${WEBHOOK_ID})`,
    })
  })

  test("does not audit when the webhook row is not found", async () => {
    mockConditionFindMany.mockResolvedValue([])
    mockWebhookFindFirst.mockResolvedValue(undefined)

    const result = await webhookService.updateWithConditions({
      workspaceId: WS,
      id: WEBHOOK_ID,
      url: URL,
      conditions: [],
    })

    expect(result).toBeUndefined()
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
    // Cache still refreshes unconditionally, unlike the audit.
    expect(mockUpdateWebhookCache).toHaveBeenCalledWith(WS)
  })
})
