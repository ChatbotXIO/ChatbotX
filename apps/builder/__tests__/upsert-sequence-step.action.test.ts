// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockAssertOwned, mockUpsertStep } = vi.hoisted(() => ({
  mockAssertOwned: vi.fn().mockResolvedValue(undefined),
  mockUpsertStep: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business/sequence", () => ({
  sequenceService: {
    assertOwned: mockAssertOwned,
    upsertStep: mockUpsertStep,
  },
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/features/sequences/schema/action", () => ({
  upsertSequenceStepRequest: {},
}))

const { upsertSequenceStepAction } = await import(
  "../src/features/sequences/actions/upsert-sequence-step.action"
)

type ActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: {
    stepId?: string
    sequenceId: string
    order: number
    delayDays?: number
    delayMinutes?: number
    delayUnit?: string
    flowId?: string
    isActive?: boolean
  }
}) => Promise<unknown>

const callAction = upsertSequenceStepAction as unknown as ActionHandler

const WS = "ws-1"
const SEQ_ID = "seq-1"
const STEP_ID = "step-1"

describe("upsertSequenceStepAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertOwned.mockResolvedValue(undefined)
    mockUpsertStep.mockResolvedValue({ stepId: STEP_ID })
  })

  test("validates ownership before delegating to sequenceService.upsertStep", async () => {
    const parsedInput = { sequenceId: SEQ_ID, order: 0 }

    const result = await callAction({
      bindArgsParsedInputs: [WS],
      parsedInput,
    })

    expect(mockAssertOwned).toHaveBeenCalledWith({
      workspaceId: WS,
      sequenceId: SEQ_ID,
    })
    expect(mockUpsertStep).toHaveBeenCalledWith({
      workspaceId: WS,
      sequenceId: SEQ_ID,
      stepId: undefined,
      data: parsedInput,
    })
    expect(result).toEqual({ stepId: STEP_ID })
  })

  test("passes stepId through on the update path", async () => {
    const parsedInput = {
      stepId: STEP_ID,
      sequenceId: SEQ_ID,
      order: 1,
      delayDays: 2,
    }

    await callAction({
      bindArgsParsedInputs: [WS],
      parsedInput,
    })

    expect(mockUpsertStep).toHaveBeenCalledWith({
      workspaceId: WS,
      sequenceId: SEQ_ID,
      stepId: STEP_ID,
      data: parsedInput,
    })
  })

  test("propagates a sequence-not-found error before upsertStep is called", async () => {
    mockAssertOwned.mockRejectedValue(new Error("Sequence not found"))

    await expect(
      callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { sequenceId: SEQ_ID, order: 0 },
      }),
    ).rejects.toThrow("Sequence not found")

    expect(mockUpsertStep).not.toHaveBeenCalled()
  })

  test("propagates an upsertStep error", async () => {
    mockUpsertStep.mockRejectedValue(new Error("Step not found"))

    await expect(
      callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID, order: 0 },
      }),
    ).rejects.toThrow("Step not found")
  })
})
