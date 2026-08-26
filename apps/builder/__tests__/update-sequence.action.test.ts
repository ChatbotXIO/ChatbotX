// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockUpdateReturning,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockFindOrFail,
  mockIsDatabaseError,
  mockReturnValidationErrors,
  mockGetTranslations,
  mockAuditRecord,
} = vi.hoisted(() => {
  const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: "seq-1" }])
  const mockUpdateWhere = vi.fn().mockReturnValue({
    returning: mockUpdateReturning,
  })
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

  return {
    mockUpdateReturning,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockFindOrFail: vi.fn().mockResolvedValue({ id: "seq-1", name: "Seq" }),
    mockIsDatabaseError: vi.fn().mockReturnValue(false),
    mockReturnValidationErrors: vi
      .fn()
      .mockReturnValue({ __validationError: true }),
    mockGetTranslations: vi.fn().mockResolvedValue((k: string) => k),
    mockAuditRecord: vi.fn().mockResolvedValue(undefined),
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
  and: (...args: unknown[]) => ({ and: args }),
  db: { update: mockUpdate },
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  findOrFail: mockFindOrFail,
  isDatabaseError: mockIsDatabaseError,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceModel: { id: "id", name: "name", workspaceId: "workspaceId" },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mockAuditRecord },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: mockGetTranslations,
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/features/sequences/schema/action", () => ({
  updateSequenceSchema: {},
}))

const { updateSequenceAction, updateSequence } = await import(
  "../src/features/sequences/actions/update-sequence.action"
)

// With the safe-action chain mock, the exported action IS the raw handler.
type ActionHandler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { name?: string; active?: boolean }
}) => Promise<unknown>

const callAction = updateSequenceAction as unknown as ActionHandler

const WS = "ws-1"
const SEQ_ID = "seq-1"

// Resets shared mock chain state between tests
function resetUpdateChain() {
  mockUpdate.mockReturnValue({ set: mockUpdateSet })
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
  mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning })
  mockUpdateReturning.mockResolvedValue([{ id: "seq-1" }])
}

describe("updateSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetUpdateChain()
    mockFindOrFail.mockResolvedValue({
      id: "seq-1",
      name: "Seq",
      active: false,
    })
    mockIsDatabaseError.mockReturnValue(false)
    mockGetTranslations.mockResolvedValue((k: string) => k)
    mockReturnValidationErrors.mockReturnValue({ __validationError: true })
  })

  describe("happy path", () => {
    test("calls findOrFail then db.update on successful update", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS, SEQ_ID],
        parsedInput: { name: "Updated Name" },
      })

      // Assert
      expect(mockFindOrFail).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    test("calls findOrFail with workspace-scoped where clause", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS, SEQ_ID],
        parsedInput: { name: "Updated" },
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

    test("passes parsedInput directly to db.update.set", async () => {
      // Arrange
      const parsedInput = { name: "New Name", active: true }

      // Act
      await callAction({
        bindArgsParsedInputs: [WS, SEQ_ID],
        parsedInput,
      })

      // Assert
      expect(mockUpdateSet).toHaveBeenCalledWith(parsedInput)
    })

    test("skips update and audit when active is unchanged", async () => {
      mockFindOrFail.mockResolvedValue({
        id: "seq-1",
        name: "Seq",
        active: true,
      })

      await callAction({
        bindArgsParsedInputs: [WS, SEQ_ID],
        parsedInput: { active: true },
      })

      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockAuditRecord).not.toHaveBeenCalled()
    })

    test("records enabled detail only when active actually changes by itself", async () => {
      await callAction({
        bindArgsParsedInputs: [WS, SEQ_ID],
        parsedInput: { active: true },
      })

      expect(mockAuditRecord).toHaveBeenCalledWith({
        workspaceId: WS,
        action: "update",
        detail: "enabled a sequence (#seq-1)",
      })
    })

    test("records generic update detail when name and active change together", async () => {
      await callAction({
        bindArgsParsedInputs: [WS, SEQ_ID],
        parsedInput: { name: "New Name", active: true },
      })

      expect(mockAuditRecord).toHaveBeenCalledWith({
        workspaceId: WS,
        action: "update",
        detail: "updated a sequence (#seq-1)",
      })
    })

    test("returns undefined on success (no explicit return value)", async () => {
      // Act
      const result = await callAction({
        bindArgsParsedInputs: [WS, SEQ_ID],
        parsedInput: { name: "Updated Seq" },
      })

      // Assert
      expect(result).toBeUndefined()
    })
  })

  describe("sequence not found", () => {
    test("propagates findOrFail error and does not call db.update", async () => {
      // Arrange
      mockFindOrFail.mockRejectedValue(new Error("Sequence not found"))

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS, SEQ_ID],
          parsedInput: { name: "Updated" },
        }),
      ).rejects.toThrow("Sequence not found")
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe("unique violation (23505)", () => {
    test("returns returnValidationErrors result on duplicate name", async () => {
      // Arrange
      const dbError = Object.assign(new Error("unique violation"), {
        cause: { code: "23505" },
      })
      mockUpdateReturning.mockRejectedValue(dbError)
      mockIsDatabaseError.mockReturnValue(true)

      // Act
      const result = await callAction({
        bindArgsParsedInputs: [WS, SEQ_ID],
        parsedInput: { name: "Duplicate" },
      })

      // Assert
      expect(mockReturnValidationErrors).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ __validationError: true })
    })
  })

  describe("other DB errors", () => {
    test("throws 'Failed to update sequence' for non-23505 DB error", async () => {
      // Arrange
      const dbError = Object.assign(new Error("other db"), {
        cause: { code: "XXXXX" },
      })
      mockUpdateReturning.mockRejectedValue(dbError)
      mockIsDatabaseError.mockReturnValue(true)

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS, SEQ_ID],
          parsedInput: { name: "Updated Seq" },
        }),
      ).rejects.toThrow("Failed to update sequence")
      expect(mockReturnValidationErrors).not.toHaveBeenCalled()
    })

    test("throws 'Failed to update sequence' for non-DB errors", async () => {
      // Arrange
      mockUpdateReturning.mockRejectedValue(new Error("network error"))
      mockIsDatabaseError.mockReturnValue(false)

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS, SEQ_ID],
          parsedInput: { name: "Updated Seq" },
        }),
      ).rejects.toThrow("Failed to update sequence")
    })
  })
})

describe("updateSequence (exported helper)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetUpdateChain()
    mockFindOrFail.mockResolvedValue({
      id: "seq-1",
      name: "Seq",
      active: false,
    })
    mockIsDatabaseError.mockReturnValue(false)
    mockGetTranslations.mockResolvedValue((k: string) => k)
    mockReturnValidationErrors.mockReturnValue({ __validationError: true })
  })

  test("is directly callable with ctx and parsedInput", async () => {
    // Act
    await updateSequence({ workspaceId: WS, id: SEQ_ID }, { name: "Direct" })

    // Assert
    expect(mockFindOrFail).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdateSet).toHaveBeenCalledWith({ name: "Direct" })
  })

  test("scopes findOrFail to the provided workspaceId", async () => {
    // Act
    await updateSequence({ workspaceId: "other-ws", id: SEQ_ID }, {})

    // Assert
    const args = mockFindOrFail.mock.calls[0]?.[0] as {
      where: { workspaceId: string }
    }
    expect(args.where.workspaceId).toBe("other-ws")
  })
})
