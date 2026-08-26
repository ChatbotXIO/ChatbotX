// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const triggerModel = {
    __model: "trigger",
    id: "trigger.id",
    workspaceId: "trigger.workspaceId",
  }
  const conditionModel = { __model: "condition", id: "condition.id" }
  const triggerReturning = vi.fn()
  const triggerWhere = vi.fn(() => ({ returning: triggerReturning }))
  const triggerSet = vi.fn(() => ({ where: triggerWhere }))
  const conditionWhere = vi.fn()
  const conditionSet = vi.fn(() => ({ where: conditionWhere }))
  const deleteWhere = vi.fn()
  const insertValues = vi.fn()

  return {
    auditRecord: vi.fn(),
    conditionModel,
    conditionSet,
    createId: vi.fn(() => "condition-generated-id"),
    dbTransaction: vi.fn(),
    deleteWhere,
    insertValues,
    triggerModel,
    triggerReturning,
    triggerSet,
    updateTriggerCache: vi.fn(),
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business/audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/business/audit")>()
  return {
    ...actual,
    auditService: { record: mocks.auditRecord },
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  db: { transaction: mocks.dbTransaction },
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  conditionModel: mocks.conditionModel,
  triggerModel: mocks.triggerModel,
}))

vi.mock("@chatbotx.io/events", () => ({
  updateTriggerCache: mocks.updateTriggerCache,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: mocks.createId }
})

vi.mock("@/features/conditions/to-condition-columns", () => ({
  toConditionColumns: (condition: {
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

vi.mock("../src/features/triggers/schema/mutation", () => ({
  updateTriggerSchema: {},
}))

const { updateTriggerAction } = await import(
  "../src/features/triggers/actions/update-trigger-action"
)

type Condition = {
  id?: string
  type: string
  sourceId?: string | null
  operator?: string | null
  value?: unknown
}

type Handler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { actions: unknown[]; conditions: Condition[] }
}) => Promise<unknown>

const tx = {
  query: {
    conditionModel: { findMany: vi.fn() },
    triggerModel: { findFirst: vi.fn() },
  },
  update: vi.fn((model: { __model: string }) =>
    model.__model === "trigger"
      ? { set: mocks.triggerSet }
      : { set: mocks.conditionSet },
  ),
  delete: vi.fn(() => ({ where: mocks.deleteWhere })),
  insert: vi.fn(() => ({ values: mocks.insertValues })),
}

const existingCondition = {
  id: "condition-1",
  type: "contact",
  sourceId: "email",
  operator: "eq",
  value: "ada@example.com",
}

const callAction = updateTriggerAction as unknown as Handler

describe("updateTriggerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dbTransaction.mockImplementation(
      async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx),
    )
    mocks.triggerReturning.mockResolvedValue([{ id: "trigger-1" }])
    mocks.conditionSet.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    })
    mocks.deleteWhere.mockResolvedValue(undefined)
    mocks.insertValues.mockResolvedValue(undefined)
    tx.query.triggerModel.findFirst.mockResolvedValue({
      id: "trigger-1",
      workspaceId: "workspace-1",
      actions: [{ type: "startFlow", flowId: "flow-1" }],
    })
    tx.query.conditionModel.findMany.mockResolvedValue([existingCondition])
  })

  test("skips writes and audit but still invalidates cache for identical actions and conditions", async () => {
    await callAction({
      bindArgsParsedInputs: ["workspace-1", "trigger-1"],
      parsedInput: {
        actions: [{ type: "startFlow", flowId: "flow-1" }],
        conditions: [{ ...existingCondition }],
      },
    })

    expect(tx.update).not.toHaveBeenCalled()
    expect(tx.delete).not.toHaveBeenCalled()
    expect(tx.insert).not.toHaveBeenCalled()
    // Cache invalidation must not be gated on the diff result — only the
    // audit record should be. See docs/plans/pr-1033-audit-log-fix-groups-1-4-5.md.
    expect(mocks.updateTriggerCache).toHaveBeenCalledWith("workspace-1")
    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("updates trigger actions and audits once for an actions-only change", async () => {
    await callAction({
      bindArgsParsedInputs: ["workspace-1", "trigger-1"],
      parsedInput: {
        actions: [{ type: "addTags", tagIds: ["tag-1"] }],
        conditions: [{ ...existingCondition }],
      },
    })

    expect(mocks.triggerSet).toHaveBeenCalledWith({
      actions: [{ type: "addTags", tagIds: ["tag-1"] }],
    })
    expect(mocks.conditionSet).not.toHaveBeenCalled()
    expect(mocks.auditRecord).toHaveBeenCalledTimes(1)
  })

  test("updates only changed existing conditions", async () => {
    await callAction({
      bindArgsParsedInputs: ["workspace-1", "trigger-1"],
      parsedInput: {
        actions: [{ type: "startFlow", flowId: "flow-1" }],
        conditions: [
          { ...existingCondition },
          {
            id: "condition-1",
            type: "contact",
            sourceId: "email",
            operator: "contains",
            value: "example.com",
          },
        ],
      },
    })

    expect(mocks.conditionSet).toHaveBeenCalledTimes(1)
    expect(mocks.conditionSet).toHaveBeenCalledWith({
      type: "contact",
      sourceId: "email",
      operator: "contains",
      value: "example.com",
    })
    expect(mocks.auditRecord).toHaveBeenCalledTimes(1)
  })

  test("writes real create and delete while ignoring a no-op condition update", async () => {
    tx.query.conditionModel.findMany.mockResolvedValue([
      existingCondition,
      { ...existingCondition, id: "condition-delete" },
    ])

    await callAction({
      bindArgsParsedInputs: ["workspace-1", "trigger-1"],
      parsedInput: {
        actions: [{ type: "startFlow", flowId: "flow-1" }],
        conditions: [
          { ...existingCondition },
          { type: "contact", sourceId: "phone", operator: "exists" },
        ],
      },
    })

    expect(mocks.conditionSet).not.toHaveBeenCalled()
    expect(tx.delete).toHaveBeenCalledOnce()
    expect(mocks.insertValues).toHaveBeenCalledWith([
      {
        id: "condition-generated-id",
        triggerId: "trigger-1",
        type: "contact",
        sourceId: "phone",
        operator: "exists",
        value: null,
      },
    ])
    expect(mocks.auditRecord).toHaveBeenCalledTimes(1)
  })
})
