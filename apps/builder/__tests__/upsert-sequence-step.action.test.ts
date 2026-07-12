// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindFirst,
  mockInsertReturning,
  mockInsertValues,
  mockInsert,
  mockUpdateReturning,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockFindOrFail,
  mockCreateId,
  mockHandleStepCreationImpact,
  mockHandleStepUpdateImpact,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn().mockResolvedValue([{ id: "new-step-id" }])
  const mockInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockInsertReturning })
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues })

  const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: "step-1" }])
  const mockUpdateWhere = vi
    .fn()
    .mockReturnValue({ returning: mockUpdateReturning })
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

  const mockFindFirst = vi.fn()

  return {
    mockFindFirst,
    mockInsertReturning,
    mockInsertValues,
    mockInsert,
    mockUpdateReturning,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockFindOrFail: vi.fn().mockResolvedValue(undefined),
    mockCreateId: vi.fn().mockReturnValue("new-step-id"),
    mockHandleStepCreationImpact: vi.fn().mockResolvedValue(undefined),
    mockHandleStepUpdateImpact: vi.fn().mockResolvedValue(undefined),
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
    insert: mockInsert,
    update: mockUpdate,
  },
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceModel: { id: "id", workspaceId: "workspaceId" },
  sequenceStepModel: { id: "id" },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: mockCreateId,
  }
})

vi.mock("@/features/common/schemas", () => ({
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

// With the safe-action chain mock, the exported action IS the raw handler.
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
    anytime?: boolean
    sendTimeStart?: string | null
    sendTimeEnd?: string | null
    sendDays?: string[]
    specificDateTime?: string
  }
}) => Promise<unknown>

const callAction = upsertSequenceStepAction as unknown as ActionHandler

const WS = "ws-1"
const SEQ_ID = "seq-1"
const STEP_ID = "step-1"

/** Returns a minimal step whose parent sequence's workspaceId can be set. */
const makeStep = (workspaceId = WS) => ({
  id: STEP_ID,
  order: 1,
  sequence: { workspaceId },
})

describe("upsertSequenceStepAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrFail.mockResolvedValue(undefined)
    mockFindFirst.mockResolvedValue(makeStep())
    mockInsert.mockReturnValue({ values: mockInsertValues })
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
    mockInsertReturning.mockResolvedValue([{ id: "new-step-id" }])
    mockUpdate.mockReturnValue({ set: mockUpdateSet })
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning })
    mockUpdateReturning.mockResolvedValue([{ id: STEP_ID }])
    mockCreateId.mockReturnValue("new-step-id")
    mockHandleStepCreationImpact.mockResolvedValue(undefined)
    mockHandleStepUpdateImpact.mockResolvedValue(undefined)
  })

  // ── CREATE PATH (no stepId) ──────────────────────────────────────────────────
  describe("create path (no stepId)", () => {
    test("validates sequence ownership, inserts a new step, and returns stepId", async () => {
      // Act
      const result = await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { sequenceId: SEQ_ID, order: 0 },
      })

      // Assert
      expect(mockFindOrFail).toHaveBeenCalledTimes(1)
      expect(mockInsert).toHaveBeenCalledTimes(1)
      expect(mockInsertReturning).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ stepId: "new-step-id" })
    })

    test("uses createId for the new step id", async () => {
      // Arrange
      mockCreateId.mockReturnValue("generated-id")
      mockInsertReturning.mockResolvedValue([{ id: "generated-id" }])

      // Act
      const result = await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { sequenceId: SEQ_ID, order: 1 },
      })

      // Assert
      expect(mockCreateId).toHaveBeenCalledTimes(1)
      expect((result as { stepId: string }).stepId).toBe("generated-id")
    })

    test("inserts step with correct sequenceId and order", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { sequenceId: SEQ_ID, order: 3 },
      })

      // Assert
      const insertArg = mockInsertValues.mock.calls[0]?.[0] as {
        sequenceId: string
        order: number
      }
      expect(insertArg.sequenceId).toBe(SEQ_ID)
      expect(insertArg.order).toBe(3)
    })

    test("calls handleStepCreationImpact with sequenceId, workspaceId, and order", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { sequenceId: SEQ_ID, order: 2 },
      })

      // Assert
      expect(mockHandleStepCreationImpact).toHaveBeenCalledWith(SEQ_ID, WS, 2)
      expect(mockHandleStepUpdateImpact).not.toHaveBeenCalled()
    })

    test("does not call db.query.findFirst (step lookup) on create path", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { sequenceId: SEQ_ID, order: 0 },
      })

      // Assert
      expect(mockFindFirst).not.toHaveBeenCalled()
    })

    test("does not call db.update on create path", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { sequenceId: SEQ_ID, order: 0 },
      })

      // Assert
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    test("validates sequence ownership via findOrFail with workspace scope", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { sequenceId: SEQ_ID, order: 0 },
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
  })

  // ── UPDATE PATH (stepId provided) ───────────────────────────────────────────
  describe("update path (stepId provided)", () => {
    test("validates sequence ownership, updates the step, and returns stepId", async () => {
      // Act
      const result = await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: {
          stepId: STEP_ID,
          sequenceId: SEQ_ID,
          order: 1,
          delayDays: 2,
        },
      })

      // Assert
      expect(mockFindOrFail).toHaveBeenCalledTimes(1)
      expect(mockFindFirst).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdateReturning).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ stepId: STEP_ID })
    })

    test("calls handleStepUpdateImpact when delayDays changes", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: {
          stepId: STEP_ID,
          sequenceId: SEQ_ID,
          order: 1,
          delayDays: 3,
        },
      })

      // Assert
      expect(mockHandleStepUpdateImpact).toHaveBeenCalledWith(
        SEQ_ID,
        WS,
        STEP_ID,
        1,
      )
      expect(mockHandleStepCreationImpact).not.toHaveBeenCalled()
    })

    test("calls handleStepUpdateImpact when isActive changes", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: {
          stepId: STEP_ID,
          sequenceId: SEQ_ID,
          order: 0,
          isActive: false,
        },
      })

      // Assert
      expect(mockHandleStepUpdateImpact).toHaveBeenCalledTimes(1)
    })

    test("does not call handleStepUpdateImpact when only flowId changes", async () => {
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

    test("queries step with correct stepId and includes sequence relation", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID, order: 0 },
      })

      // Assert
      const findArgs = mockFindFirst.mock.calls[0]?.[0] as {
        where: { id: string }
        with: { sequence: boolean }
      }
      expect(findArgs.where.id).toBe(STEP_ID)
      expect(findArgs.with.sequence).toBe(true)
    })

    test("does not call db.insert on update path", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID, order: 0 },
      })

      // Assert
      expect(mockInsert).not.toHaveBeenCalled()
    })
  })

  // ── SEQUENCE NOT FOUND ───────────────────────────────────────────────────────
  describe("sequence not found", () => {
    test("throws when findOrFail rejects on create path", async () => {
      // Arrange
      mockFindOrFail.mockRejectedValue(new Error("Sequence not found"))

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { sequenceId: SEQ_ID, order: 0 },
        }),
      ).rejects.toThrow("Sequence not found")
    })

    test("throws when findOrFail rejects on update path", async () => {
      // Arrange
      mockFindOrFail.mockRejectedValue(new Error("Sequence not found"))

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID, order: 0 },
        }),
      ).rejects.toThrow("Sequence not found")

      expect(mockFindFirst).not.toHaveBeenCalled()
    })
  })

  // ── STEP NOT FOUND (update path) ─────────────────────────────────────────────
  describe("step not found (update path)", () => {
    test("throws 'Step not found' when db query returns null", async () => {
      // Arrange
      mockFindFirst.mockResolvedValue(null)

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID, order: 0 },
        }),
      ).rejects.toThrow("Step not found")

      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  // ── WORKSPACE MISMATCH (update path) ─────────────────────────────────────────
  describe("workspace mismatch (update path)", () => {
    test("throws unauthorized error when step belongs to a different workspace", async () => {
      // Arrange
      mockFindFirst.mockResolvedValue(makeStep("other-ws"))

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { stepId: STEP_ID, sequenceId: SEQ_ID, order: 0 },
        }),
      ).rejects.toThrow("Unauthorized: Step does not belong to this workspace")

      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockHandleStepUpdateImpact).not.toHaveBeenCalled()
    })
  })
})
