// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockCreate, mockReturnValidationErrors, mockGetTranslations } =
  vi.hoisted(() => ({
    mockCreate: vi.fn(),
    mockReturnValidationErrors: vi
      .fn()
      .mockReturnValue({ __validationError: true }),
    mockGetTranslations: vi.fn().mockResolvedValue((k: string) => k),
  }))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  sequenceService: { create: mockCreate },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: mockGetTranslations,
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

const mockCreateSequenceRequest = { __schema: "createSequenceRequest" }
vi.mock("@/features/sequences/schema/action", () => ({
  createSequenceRequest: mockCreateSequenceRequest,
}))

const { createSequenceAction } = await import(
  "../src/features/sequences/actions/create-sequence.action"
)

type Handler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { name: string; folderId?: string | null }
}) => Promise<unknown>

const callAction = createSequenceAction as unknown as Handler

const WS = "ws-1"

describe("createSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTranslations.mockResolvedValue((k: string) => k)
    mockReturnValidationErrors.mockReturnValue({ __validationError: true })
  })

  test("delegates to sequenceService.create and returns its result", async () => {
    mockCreate.mockResolvedValue({ sequenceId: "seq-1" })

    const result = await callAction({
      bindArgsParsedInputs: [WS],
      parsedInput: { name: "My Sequence", folderId: null },
    })

    expect(mockCreate).toHaveBeenCalledWith({
      workspaceId: WS,
      name: "My Sequence",
      folderId: null,
    })
    expect(result).toEqual({ sequenceId: "seq-1" })
  })

  test("maps a validationException(name) to returnValidationErrors with the createSequenceRequest schema", async () => {
    const validationError = Object.assign(new Error("Name is already taken."), {
      code: "validation",
      field: "name",
    })
    mockCreate.mockRejectedValue(validationError)

    const result = await callAction({
      bindArgsParsedInputs: [WS],
      parsedInput: { name: "Duplicate" },
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ __validationError: true })

    const [schema, errors] = mockReturnValidationErrors.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ]
    expect(schema).toBe(mockCreateSequenceRequest)
    expect(errors).toHaveProperty("_errors")
    expect(errors).toHaveProperty("name._errors")
  })

  test("throws 'Failed to create sequence' for non-validation errors", async () => {
    mockCreate.mockRejectedValue(new Error("network error"))

    await expect(
      callAction({
        bindArgsParsedInputs: [WS],
        parsedInput: { name: "Seq", folderId: null },
      }),
    ).rejects.toThrow("Failed to create sequence")
    expect(mockReturnValidationErrors).not.toHaveBeenCalled()
  })
})
