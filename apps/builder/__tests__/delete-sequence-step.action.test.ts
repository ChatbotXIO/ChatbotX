// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDeleteWhere,
  mockDelete,
  mockFindOrFail,
  mockFindFirst,
  mockRecalculateAllContactsInSequence,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere })
  const mockFindFirst = vi.fn()

  return {
    mockDeleteWhere,
    mockDelete,
    mockFindOrFail: vi.fn().mockResolvedValue(undefined),
    mockFindFirst,
    mockRecalculateAllContactsInSequence: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      sequenceStepModel: { findFirst: mockFindFirst },
    },
    delete: mockDelete,
  },
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceModel: { id: "id", workspaceId: "workspaceId" },
  sequenceStepModel: { id: "id" },
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

// With the safe-action chain mock, the exported action IS the raw handler.
type ActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { stepId: string; sequenceId: string }
}) => Promise<unknown>

const callAction = deleteSequenceStepAction as unknown as ActionHandler

const WS = "ws-1"
const SEQ_ID = "seq-1"
const STEP_ID = "step-1"

/** Helper to produce a step object with the given workspace on its parent sequence */
const makeStep = (workspaceId = WS) => ({
  id: STEP_ID,
  sequence: { workspaceId },
})

describe("deleteSequenceStepAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockReturnValue({ where: mockDeleteWhere })
    mockDeleteWhere.mockResolvedValue(undefined)
    mockFindOrFail.mockResolvedValue(undefined)
    mockFindFirst.mockResolvedValue(makeStep())
    mockRecalculateAllContactsInSequence.mockResolvedValue(undefined)
  })

  describe("happy path", () => {
    test("validates sequence ownership, deletes step, and recalculates contacts", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
      })

      // Assert
      expect(mockFindOrFail).toHaveBeenCalledTimes(1)
      expect(mockFindFirst).toHaveBeenCalledTimes(1)
      expect(mockDelete).toHaveBeenCalledTimes(1)
      expect(mockRecalculateAllContactsInSequence).toHaveBeenCalledTimes(1)
    })

    test("returns { success: true }", async () => {
      // Act
      const result = await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
      })

      // Assert
      expect(result).toEqual({ success: true })
    })

    test("calls findOrFail with sequenceId and workspaceId for ownership validation", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
      })

      // Assert
      const args = mockFindOrFail.mock.calls[0]?.[0] as {
        where: { id: string; workspaceId: string }
        message: string
      }
      expect(args.where.id).toBe(SEQ_ID)
      expect(args.where.workspaceId).toBe(WS)
      expect(args.message).toBe("Sequence not found")
    })

    test("calls recalculateAllContactsInSequence with sequenceId and workspaceId", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
      })

      // Assert
      expect(mockRecalculateAllContactsInSequence).toHaveBeenCalledWith(
        SEQ_ID,
        WS,
      )
    })

    test("queries step with the provided stepId", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
      })

      // Assert
      const findArgs = mockFindFirst.mock.calls[0]?.[0] as {
        where: { id: string }
        with: { sequence: boolean }
      }
      expect(findArgs.where.id).toBe(STEP_ID)
      expect(findArgs.with.sequence).toBe(true)
    })
  })

  describe("sequence not found", () => {
    test("throws when findOrFail rejects and does not delete or recalculate", async () => {
      // Arrange
      mockFindOrFail.mockRejectedValue(new Error("Sequence not found"))

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
        }),
      ).rejects.toThrow("Sequence not found")

      expect(mockDelete).not.toHaveBeenCalled()
      expect(mockRecalculateAllContactsInSequence).not.toHaveBeenCalled()
    })
  })

  describe("step not found", () => {
    test("throws 'Step not found' when db query returns null", async () => {
      // Arrange
      mockFindFirst.mockResolvedValue(null)

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
        }),
      ).rejects.toThrow("Step not found")

      expect(mockDelete).not.toHaveBeenCalled()
      expect(mockRecalculateAllContactsInSequence).not.toHaveBeenCalled()
    })
  })

  describe("workspace mismatch", () => {
    test("throws unauthorized error when step belongs to a different workspace", async () => {
      // Arrange
      mockFindFirst.mockResolvedValue(makeStep("other-workspace"))

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID },
        }),
      ).rejects.toThrow("Unauthorized: Step does not belong to this workspace")

      expect(mockDelete).not.toHaveBeenCalled()
      expect(mockRecalculateAllContactsInSequence).not.toHaveBeenCalled()
    })
  })
})
