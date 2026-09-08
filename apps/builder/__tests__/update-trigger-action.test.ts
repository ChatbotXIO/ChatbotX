// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockUpdateWithConditions } = vi.hoisted(() => ({
  mockUpdateWithConditions: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  triggerService: { updateWithConditions: mockUpdateWithConditions },
}))

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

const callAction = updateTriggerAction as unknown as Handler

describe("updateTriggerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateWithConditions.mockResolvedValue({ id: "trigger-1" })
  })

  test("maps conditions via toConditionColumns and delegates to triggerService.updateWithConditions", async () => {
    const result = await callAction({
      bindArgsParsedInputs: ["workspace-1", "trigger-1"],
      parsedInput: {
        actions: [{ type: "startFlow", flowId: "flow-1" }],
        conditions: [
          {
            id: "condition-1",
            type: "contact",
            sourceId: "email",
            operator: "eq",
            value: "ada@example.com",
          },
          { type: "contact", sourceId: "phone", operator: "exists" },
        ],
      },
    })

    expect(mockUpdateWithConditions).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "trigger-1",
      actions: [{ type: "startFlow", flowId: "flow-1" }],
      conditions: [
        {
          id: "condition-1",
          type: "contact",
          sourceId: "email",
          operator: "eq",
          value: "ada@example.com",
        },
        {
          id: undefined,
          type: "contact",
          sourceId: "phone",
          operator: "exists",
          value: null,
        },
      ],
    })
    expect(result).toEqual({ id: "trigger-1" })
  })

  test("propagates errors from the service", async () => {
    mockUpdateWithConditions.mockRejectedValue(new Error("boom"))

    await expect(
      callAction({
        bindArgsParsedInputs: ["workspace-1", "trigger-1"],
        parsedInput: { actions: [], conditions: [] },
      }),
    ).rejects.toThrow("boom")
  })
})
