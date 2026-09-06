// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAssertOwned,
  mockCreateStep,
  mockUpdateStep,
  mockHandleStepCreationImpact,
  mockHandleStepUpdateImpact,
} = vi.hoisted(() => ({
  mockAssertOwned: vi.fn().mockResolvedValue(undefined),
  mockCreateStep: vi.fn(),
  mockUpdateStep: vi.fn(),
  mockHandleStepCreationImpact: vi.fn().mockResolvedValue(undefined),
  mockHandleStepUpdateImpact: vi.fn().mockResolvedValue(undefined),
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
    createStep: mockCreateStep,
    updateStep: mockUpdateStep,
  },
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/features/contact-sequences/utils/calculate-next-run-at", () => ({
  handleStepCreationImpact: mockHandleStepCreationImpact,
  handleStepUpdateImpact: mockHandleStepUpdateImpact,
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
    mockCreateStep.mockResolvedValue({ id: "new-step-id" })
    mockUpdateStep.mockResolvedValue({
      previousOrder: 1,
      step: { id: STEP_ID },
    })
  })

  describe("create path (no stepId)", () => {
    test("validates ownership, creates the step, and recalculates for affected contacts", async () => {
      const result = await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { sequenceId: SEQ_ID, order: 0 },
      })

      expect(mockAssertOwned).toHaveBeenCalledWith({
        workspaceId: WS,
        sequenceId: SEQ_ID,
      })
      expect(mockCreateStep).toHaveBeenCalledWith({
        workspaceId: WS,
        sequenceId: SEQ_ID,
        data: { sequenceId: SEQ_ID, order: 0 },
      })
      expect(mockHandleStepCreationImpact).toHaveBeenCalledWith(SEQ_ID, WS, 0)
      expect(mockHandleStepUpdateImpact).not.toHaveBeenCalled()
      expect(result).toEqual({ stepId: "new-step-id" })
    })

    test("does not call updateStep on the create path", async () => {
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { sequenceId: SEQ_ID, order: 0 },
      })

      expect(mockUpdateStep).not.toHaveBeenCalled()
    })
  })

  describe("update path (stepId provided)", () => {
    test("validates ownership, updates the step, and returns its id", async () => {
      const result = await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: {
          stepId: STEP_ID,
          sequenceId: SEQ_ID,
          order: 1,
          delayDays: 2,
        },
      })

      expect(mockUpdateStep).toHaveBeenCalledWith({
        workspaceId: WS,
        stepId: STEP_ID,
        data: {
          stepId: STEP_ID,
          sequenceId: SEQ_ID,
          order: 1,
          delayDays: 2,
        },
      })
      expect(result).toEqual({ stepId: STEP_ID })
    })

    test("calls handleStepUpdateImpact when delayDays changes", async () => {
      mockUpdateStep.mockResolvedValue({
        previousOrder: 1,
        step: { id: STEP_ID },
      })

      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: {
          stepId: STEP_ID,
          sequenceId: SEQ_ID,
          order: 1,
          delayDays: 3,
        },
      })

      expect(mockHandleStepUpdateImpact).toHaveBeenCalledWith(
        SEQ_ID,
        WS,
        STEP_ID,
        1,
      )
      expect(mockHandleStepCreationImpact).not.toHaveBeenCalled()
    })

    test("calls handleStepUpdateImpact when isActive changes", async () => {
      mockUpdateStep.mockResolvedValue({
        previousOrder: 0,
        step: { id: STEP_ID },
      })

      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: {
          stepId: STEP_ID,
          sequenceId: SEQ_ID,
          order: 0,
          isActive: false,
        },
      })

      expect(mockHandleStepUpdateImpact).toHaveBeenCalledTimes(1)
    })

    test("calls handleStepUpdateImpact when order changed from previousOrder", async () => {
      mockUpdateStep.mockResolvedValue({
        previousOrder: 5,
        step: { id: STEP_ID },
      })

      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: {
          stepId: STEP_ID,
          sequenceId: SEQ_ID,
          order: 1,
        },
      })

      expect(mockHandleStepUpdateImpact).toHaveBeenCalledTimes(1)
    })

    test("does not call handleStepUpdateImpact when only flowId changes and order is unchanged", async () => {
      mockUpdateStep.mockResolvedValue({
        previousOrder: 1,
        step: { id: STEP_ID },
      })

      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: {
          stepId: STEP_ID,
          sequenceId: SEQ_ID,
          order: 1,
          flowId: "flow-abc",
        },
      })

      expect(mockHandleStepUpdateImpact).not.toHaveBeenCalled()
    })

    test("does not call createStep on the update path", async () => {
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID, order: 0 },
      })

      expect(mockCreateStep).not.toHaveBeenCalled()
    })
  })

  describe("errors", () => {
    test("propagates a sequence-not-found error on the create path", async () => {
      mockAssertOwned.mockRejectedValue(new Error("Sequence not found"))

      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { sequenceId: SEQ_ID, order: 0 },
        }),
      ).rejects.toThrow("Sequence not found")
    })

    test("propagates a step-not-found error on the update path", async () => {
      mockUpdateStep.mockRejectedValue(new Error("Step not found"))

      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID, order: 0 },
        }),
      ).rejects.toThrow("Step not found")

      expect(mockHandleStepUpdateImpact).not.toHaveBeenCalled()
    })

    test("propagates an unauthorized cross-workspace error on the update path", async () => {
      mockUpdateStep.mockRejectedValue(
        new Error("Unauthorized: Step does not belong to this workspace"),
      )

      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID, order: 0 },
        }),
      ).rejects.toThrow("Unauthorized: Step does not belong to this workspace")
    })
  })
})
