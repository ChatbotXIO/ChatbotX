// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockDeleteWhere, mockDelete, mockFindOrFail, mockAuditRecord } =
  vi.hoisted(() => {
    const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
    const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere })

    return {
      mockDeleteWhere,
      mockDelete,
      mockFindOrFail: vi.fn().mockResolvedValue({ id: "seq-1", name: "Seq" }),
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
  db: { delete: mockDelete },
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mockAuditRecord },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceModel: { id: "id", workspaceId: "workspaceId" },
}))

const { deleteSequenceAction, deleteSequence } = await import(
  "../src/features/sequences/actions/delete-sequence.action"
)

// deleteSequenceAction uses bindArgsSchemas ONLY (no inputSchema).
// With the safe-action chain mock the exported value is the raw handler.
type ActionHandler = (args: {
  bindArgsParsedInputs: [string, string]
}) => Promise<unknown>

const callAction = deleteSequenceAction as unknown as ActionHandler

const WS = "ws-1"
const SEQ_ID = "seq-1"

describe("deleteSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockReturnValue({ where: mockDeleteWhere })
    mockDeleteWhere.mockResolvedValue(undefined)
    mockFindOrFail.mockResolvedValue({ id: "seq-1", name: "Seq" })
  })

  describe("happy path", () => {
    test("calls findOrFail and db.delete for a valid sequence", async () => {
      // Act
      await callAction({ bindArgsParsedInputs: [WS, SEQ_ID] })

      // Assert
      expect(mockFindOrFail).toHaveBeenCalledTimes(1)
      expect(mockDelete).toHaveBeenCalledTimes(1)
    })

    test("calls findOrFail with workspace-scoped where clause", async () => {
      // Act
      await callAction({ bindArgsParsedInputs: [WS, SEQ_ID] })

      // Assert
      const args = mockFindOrFail.mock.calls[0]?.[0] as {
        where: { id: string; workspaceId: string }
        message: string
      }
      expect(args.where.id).toBe(SEQ_ID)
      expect(args.where.workspaceId).toBe(WS)
      expect(args.message).toBe("Sequence not found")
    })

    test("calls db.delete after successful findOrFail", async () => {
      // Act
      await callAction({ bindArgsParsedInputs: [WS, SEQ_ID] })

      // Assert – order: findOrFail is invoked before delete
      const findOrFailOrder = mockFindOrFail.mock.invocationCallOrder[0] ?? -1
      const deleteOrder = mockDelete.mock.invocationCallOrder[0] ?? -2
      expect(findOrFailOrder).toBeLessThan(deleteOrder)
    })
  })

  describe("sequence not found", () => {
    test("propagates findOrFail error and does not call db.delete", async () => {
      // Arrange
      mockFindOrFail.mockRejectedValue(new Error("Sequence not found"))

      // Act & Assert
      await expect(
        callAction({ bindArgsParsedInputs: [WS, SEQ_ID] }),
      ).rejects.toThrow("Sequence not found")
      expect(mockDelete).not.toHaveBeenCalled()
    })

    test("does not call db.delete.where when findOrFail throws", async () => {
      // Arrange
      mockFindOrFail.mockRejectedValue(new Error("not found"))

      // Act
      await callAction({ bindArgsParsedInputs: [WS, SEQ_ID] }).catch(() => {
        // intentionally swallow
      })

      // Assert
      expect(mockDeleteWhere).not.toHaveBeenCalled()
    })
  })
})

describe("deleteSequence (exported helper)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockReturnValue({ where: mockDeleteWhere })
    mockDeleteWhere.mockResolvedValue(undefined)
    mockFindOrFail.mockResolvedValue({ id: "seq-1", name: "Seq" })
  })

  test("is directly callable with ctx object", async () => {
    // Act
    await deleteSequence({ workspaceId: WS, id: SEQ_ID })

    // Assert
    expect(mockFindOrFail).toHaveBeenCalledTimes(1)
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })

  test("scopes findOrFail to the provided workspaceId", async () => {
    // Act
    await deleteSequence({ workspaceId: "alt-ws", id: SEQ_ID })

    // Assert
    const args = mockFindOrFail.mock.calls[0]?.[0] as {
      where: { workspaceId: string }
    }
    expect(args.where.workspaceId).toBe("alt-ws")
  })

  test("does not delete when findOrFail rejects", async () => {
    // Arrange
    mockFindOrFail.mockRejectedValue(new Error("Sequence not found"))

    // Act & Assert
    await expect(
      deleteSequence({ workspaceId: WS, id: SEQ_ID }),
    ).rejects.toThrow("Sequence not found")
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
