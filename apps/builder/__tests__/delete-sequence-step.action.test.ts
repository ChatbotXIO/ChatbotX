// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockAssertOwned, mockDeleteStep } = vi.hoisted(() => ({
  mockAssertOwned: vi.fn().mockResolvedValue(undefined),
  mockDeleteStep: vi.fn().mockResolvedValue(undefined),
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
    deleteStep: mockDeleteStep,
  },
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

const { deleteSequenceStepAction } = await import(
  "../src/features/sequences/actions/delete-sequence-step.action"
)

type ActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { stepId: string; sequenceId: string }
}) => Promise<unknown>

const callAction = deleteSequenceStepAction as unknown as ActionHandler

const WS = "ws-1"
const SEQ_ID = "seq-1"
const STEP_ID = "step-1"

describe("deleteSequenceStepAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertOwned.mockResolvedValue(undefined)
    mockDeleteStep.mockResolvedValue(undefined)
  })

  test("validates sequence ownership and delegates to sequenceService.deleteStep", async () => {
    const result = await callAction({
      bindArgsParsedInputs: [WS],
      parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
    })

    expect(mockAssertOwned).toHaveBeenCalledWith({
      workspaceId: WS,
      sequenceId: SEQ_ID,
    })
    expect(mockDeleteStep).toHaveBeenCalledWith({
      workspaceId: WS,
      stepId: STEP_ID,
    })
    expect(result).toEqual({ success: true })
  })

  test("propagates a sequence-not-found error and never deletes", async () => {
    mockAssertOwned.mockRejectedValue(new Error("Sequence not found"))

    await expect(
      callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
      }),
    ).rejects.toThrow("Sequence not found")

    expect(mockDeleteStep).not.toHaveBeenCalled()
  })

  test("propagates a step-not-found error", async () => {
    mockDeleteStep.mockRejectedValue(new Error("Step not found"))

    await expect(
      callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
      }),
    ).rejects.toThrow("Step not found")
  })

  test("propagates an unauthorized cross-workspace error", async () => {
    mockDeleteStep.mockRejectedValue(
      new Error("Unauthorized: Step does not belong to this workspace"),
    )

    await expect(
      callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
      }),
    ).rejects.toThrow("Unauthorized: Step does not belong to this workspace")
  })
})
