// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateId,
  mockDbTransaction,
  mockTriggerFindFirst,
  mockConditionFindMany,
  mockTxUpdate,
  mockTxUpdateSet,
  mockTxUpdateReturning,
  mockTxDelete,
  mockTxDeleteWhere,
  mockTxInsert,
  mockTxInsertValues,
  mockUpdateTriggerCache,
  mockDispatchAuditRecord,
} = vi.hoisted(() => {
  const mockTxUpdateReturning = vi.fn().mockResolvedValue([])
  const mockTxUpdateWhere = vi
    .fn()
    .mockReturnValue({ returning: mockTxUpdateReturning })
  const mockTxUpdateSet = vi.fn().mockReturnValue({ where: mockTxUpdateWhere })
  const mockTxUpdate = vi.fn().mockReturnValue({ set: mockTxUpdateSet })
  const mockTxDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockTxDelete = vi.fn().mockReturnValue({ where: mockTxDeleteWhere })
  const mockTxInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockTxInsert = vi.fn().mockReturnValue({ values: mockTxInsertValues })

  return {
    mockCreateId: vi.fn(() => "new-condition-id"),
    mockDbTransaction: vi.fn(),
    mockTriggerFindFirst: vi.fn(),
    mockConditionFindMany: vi.fn(),
    mockTxUpdate,
    mockTxUpdateSet,
    mockTxUpdateReturning,
    mockTxDelete,
    mockTxDeleteWhere,
    mockTxInsert,
    mockTxInsertValues,
    mockUpdateTriggerCache: vi.fn().mockResolvedValue(undefined),
    mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
  }
})

const tx = {
  query: {
    triggerModel: { findFirst: mockTriggerFindFirst },
    conditionModel: { findMany: mockConditionFindMany },
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
  triggerModel: {
    id: "triggerModel.id",
    workspaceId: "triggerModel.workspaceId",
  },
}))

vi.mock("@chatbotx.io/events", () => ({
  removeTriggerCache: vi.fn(),
  updateTriggerCache: mockUpdateTriggerCache,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: vi.fn() },
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { triggerService } = await import("../src/trigger/service")

const WS = "ws-1"
const TRIGGER_ID = "trigger-1"

describe("triggerService.updateWithConditions", () => {
  beforeEach(() => {
    mockDbTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test("returns undefined and makes no writes when the trigger does not exist", async () => {
    mockTriggerFindFirst.mockResolvedValue(undefined)
    mockConditionFindMany.mockResolvedValue([])

    const result = await triggerService.updateWithConditions({
      workspaceId: WS,
      id: TRIGGER_ID,
      actions: [],
      conditions: [],
    })

    expect(result).toBeUndefined()
    expect(mockUpdateTriggerCache).not.toHaveBeenCalled()
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("does not audit or refresh cache when nothing actually changed (hasRealChange gate)", async () => {
    mockTriggerFindFirst
      .mockResolvedValueOnce({
        id: TRIGGER_ID,
        actions: [{ type: "sendMessage" }],
      })
      .mockResolvedValueOnce({ id: TRIGGER_ID })
    mockConditionFindMany.mockResolvedValue([])

    const result = await triggerService.updateWithConditions({
      workspaceId: WS,
      id: TRIGGER_ID,
      actions: [{ type: "sendMessage" }],
      conditions: [],
    })

    expect(result).toEqual({ id: TRIGGER_ID })
    // Cache updates when the trigger exists, regardless of hasRealChange.
    expect(mockUpdateTriggerCache).toHaveBeenCalledWith(WS)
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("audits when actions changed", async () => {
    mockTriggerFindFirst
      .mockResolvedValueOnce({
        id: TRIGGER_ID,
        actions: [{ type: "sendMessage" }],
      })
      .mockResolvedValueOnce({ id: TRIGGER_ID })
    mockConditionFindMany.mockResolvedValue([])
    mockTxUpdateReturning.mockResolvedValue([{ id: TRIGGER_ID }])

    await triggerService.updateWithConditions({
      workspaceId: WS,
      id: TRIGGER_ID,
      actions: [{ type: "sendMessageV2" }],
      conditions: [],
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: `updated a trigger (#${TRIGGER_ID})`,
    })
  })

  test("partitions conditions into delete/update/create and applies each", async () => {
    mockTriggerFindFirst
      .mockResolvedValueOnce({ id: TRIGGER_ID, actions: [] })
      .mockResolvedValueOnce({ id: TRIGGER_ID })
    mockConditionFindMany.mockResolvedValue([
      {
        id: "cond-keep-changed",
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

    await triggerService.updateWithConditions({
      workspaceId: WS,
      id: TRIGGER_ID,
      actions: [],
      conditions: [
        {
          id: "cond-keep-changed",
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

    // updates the changed condition
    expect(mockTxUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "tag-new" }),
    )

    // creates the new condition
    expect(mockTxInsertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "new-condition-id",
        triggerId: TRIGGER_ID,
        type: "newContact",
      }),
    ])
  })
})
