// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAssertOwned,
  mockDeleteStep,
  mockRecalculateAllContactsInSequence,
} = vi.hoisted(() => ({
  mockAssertOwned: vi.fn().mockResolvedValue(undefined),
  mockDeleteStep: vi.fn().mockResolvedValue(undefined),
  mockRecalculateAllContactsInSequence: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  sequenceService: {
    assertOwned: mockAssertOwned,
    deleteStep: mockDeleteStep,
  },
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/features/contact-sequences/utils/calculate-next-run-at", () => ({
  recalculateAllContactsInSequence: mockRecalculateAllContactsInSequence,
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
    mockRecalculateAllContactsInSequence.mockResolvedValue(undefined)
  })

  test("validates sequence ownership, deletes step, and recalculates contacts", async () => {
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
    expect(mockRecalculateAllContactsInSequence).toHaveBeenCalledWith(
      SEQ_ID,
      WS,
    )
    expect(result).toEqual({ success: true })
  })

  test("propagates a sequence-not-found error and never deletes or recalculates", async () => {
    mockAssertOwned.mockRejectedValue(new Error("Sequence not found"))

    await expect(
      callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
      }),
    ).rejects.toThrow("Sequence not found")

    expect(mockDeleteStep).not.toHaveBeenCalled()
    expect(mockRecalculateAllContactsInSequence).not.toHaveBeenCalled()
  })

  test("propagates a step-not-found error and never recalculates", async () => {
    mockDeleteStep.mockRejectedValue(new Error("Step not found"))

    await expect(
      callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
      }),
    ).rejects.toThrow("Step not found")

    expect(mockRecalculateAllContactsInSequence).not.toHaveBeenCalled()
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
