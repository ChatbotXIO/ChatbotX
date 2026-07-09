// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockInsertValues,
  mockInsert,
  mockIsDatabaseError,
  mockReturnValidationErrors,
  mockGetTranslations,
  mockCreateId,
  mockCreateSequenceRequest,
} = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues })

  return {
    mockInsertValues,
    mockInsert,
    mockIsDatabaseError: vi.fn().mockReturnValue(false),
    mockReturnValidationErrors: vi
      .fn()
      .mockReturnValue({ __validationError: true }),
    mockGetTranslations: vi.fn().mockResolvedValue((k: string) => k),
    mockCreateId: vi.fn().mockReturnValue("test-id"),
    mockCreateSequenceRequest: { __schema: "createSequenceRequest" },
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
  db: { insert: mockInsert },
  isDatabaseError: mockIsDatabaseError,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceModel: { id: "id", name: "name", workspaceId: "workspaceId" },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: mockCreateId,
  }
})

vi.mock("next-intl/server", () => ({
  getTranslations: mockGetTranslations,
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/features/common/schemas", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/features/sequences/schema/action", () => ({
  createSequenceRequest: mockCreateSequenceRequest,
}))

const { createSequenceAction } = await import(
  "../src/features/sequences/actions/create-sequence.action"
)

// With the safe-action chain mock, the exported action IS the raw handler.
type Handler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { name: string; folderId?: string | null }
}) => Promise<unknown>

const callAction = createSequenceAction as unknown as Handler

const WS = "ws-1"

describe("createSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockReturnValue({ values: mockInsertValues })
    mockInsertValues.mockResolvedValue(undefined)
    mockIsDatabaseError.mockReturnValue(false)
    mockGetTranslations.mockResolvedValue((k: string) => k)
    mockCreateId.mockReturnValue("test-id")
    mockReturnValidationErrors.mockReturnValue({ __validationError: true })
  })

  describe("happy path", () => {
    test("inserts sequence with correct fields and returns sequenceId", async () => {
      // Arrange
      const parsedInput = { name: "My Sequence", folderId: null }

      // Act
      const result = await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput,
      })

      // Assert
      expect(mockInsert).toHaveBeenCalledTimes(1)
      expect(mockInsertValues).toHaveBeenCalledWith({
        id: "test-id",
        workspaceId: WS,
        name: "My Sequence",
        folderId: null,
      })
      expect(result).toEqual({ sequenceId: "test-id" })
    })

    test("uses createId result as the new sequence id", async () => {
      // Arrange
      mockCreateId.mockReturnValue("custom-id")

      // Act
      const result = await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { name: "Seq" },
      })

      // Assert
      expect(mockCreateId).toHaveBeenCalledTimes(1)
      expect((result as { sequenceId: string }).sequenceId).toBe("custom-id")
    })

    test("stores folderId as null when parsedInput.folderId is undefined", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { name: "Seq" },
      })

      // Assert
      const arg = mockInsertValues.mock.calls[0]?.[0] as { folderId: unknown }
      expect(arg.folderId).toBeNull()
    })

    test("stores folderId as null when parsedInput.folderId is explicitly null", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { name: "Seq", folderId: null },
      })

      // Assert
      const arg = mockInsertValues.mock.calls[0]?.[0] as { folderId: unknown }
      expect(arg.folderId).toBeNull()
    })

    test("passes folderId through when a non-null value is provided", async () => {
      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { name: "Seq", folderId: "folder-99" },
      })

      // Assert
      const arg = mockInsertValues.mock.calls[0]?.[0] as { folderId: unknown }
      expect(arg.folderId).toBe("folder-99")
    })
  })

  describe("unique violation (23505)", () => {
    test("returns returnValidationErrors result on duplicate name", async () => {
      // Arrange
      const dbError = Object.assign(new Error("unique violation"), {
        cause: { code: "23505" },
      })
      mockInsertValues.mockRejectedValue(dbError)
      mockIsDatabaseError.mockReturnValue(true)

      // Act
      const result = await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { name: "Duplicate", folderId: null },
      })

      // Assert
      expect(mockReturnValidationErrors).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ __validationError: true })
    })

    test("calls returnValidationErrors with the createSequenceRequest schema", async () => {
      // Arrange
      const dbError = Object.assign(new Error("unique violation"), {
        cause: { code: "23505" },
      })
      mockInsertValues.mockRejectedValue(dbError)
      mockIsDatabaseError.mockReturnValue(true)

      // Act
      await callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { name: "Duplicate" },
      })

      // Assert — first argument is the schema, second is the errors object
      const [schema, errors] = mockReturnValidationErrors.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ]
      expect(schema).toBe(mockCreateSequenceRequest)
      expect(errors).toHaveProperty("_errors")
      expect(errors).toHaveProperty("name._errors")
    })
  })

  describe("non-23505 DB errors", () => {
    test("throws 'Failed to create sequence' for non-23505 DB errors", async () => {
      // Arrange
      const dbError = Object.assign(new Error("other db"), {
        cause: { code: "XXXXX" },
      })
      mockInsertValues.mockRejectedValue(dbError)
      mockIsDatabaseError.mockReturnValue(true)

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { name: "Seq", folderId: null },
        }),
      ).rejects.toThrow("Failed to create sequence")
      expect(mockReturnValidationErrors).not.toHaveBeenCalled()
    })

    test("throws 'Failed to create sequence' for non-DB errors", async () => {
      // Arrange
      mockInsertValues.mockRejectedValue(new Error("network error"))
      mockIsDatabaseError.mockReturnValue(false)

      // Act & Assert
      await expect(
        callAction({
          bindArgsParsedInputs: [WS],
          parsedInput: { name: "Seq", folderId: null },
        }),
      ).rejects.toThrow("Failed to create sequence")
    })
  })
})
