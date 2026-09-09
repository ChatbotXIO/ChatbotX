// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockUpdate = vi.fn()
const mockFindOrFail = vi.fn()
const mockSetStatus = vi.fn()
const mockDeleteMany = vi.fn()
const mockReturnValidationErrors = vi.fn((_schema, errors) => errors)

vi.mock("@chatbotx.io/business", () => ({
  automatedResponseService: {
    update: (...args: unknown[]) => mockUpdate(...args),
    findOrFail: (...args: unknown[]) => mockFindOrFail(...args),
    setStatus: (...args: unknown[]) => mockSetStatus(...args),
    deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  automatedResponseTypes: {},
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/lib/errors/validation-exception", () => ({
  isValidationException: () => false,
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
  bulkUpdateIdsRequest: {},
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("../src/features/automated-response/schema/action", () => ({
  updateAutomatedResponseRequest: {},
}))

const { updateAutomatedResponse } = await import(
  "../src/features/automated-response/actions/update-automated-response-action"
)
const { enableAutomatedResponse } = await import(
  "../src/features/automated-response/actions/enable-automated-response-action"
)
const { deleteAutomatedResponseAction: deleteAutomatedResponseActionUntyped } =
  await import(
    "../src/features/automated-response/actions/delete-automated-response-action"
  )
const deleteAutomatedResponseAction =
  deleteAutomatedResponseActionUntyped as unknown as (
    props: unknown,
  ) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("automated-response private actions — type scope threading", () => {
  test("updateAutomatedResponse passes the caller's type through to the service, not a hardcoded one", async () => {
    mockUpdate.mockResolvedValue({ id: "ar-1" })

    await updateAutomatedResponse(
      { workspaceId: "ws-1", id: "ar-1", type: "outbound" },
      { text: "hi", flowId: null, folderId: null, keywords: [{ value: "x" }] },
    )

    expect(mockUpdate).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "ar-1", type: "outbound" },
      expect.objectContaining({ text: "hi" }),
    )
  })

  test("enableAutomatedResponse scopes both findOrFail and setStatus by the caller's type", async () => {
    mockFindOrFail.mockResolvedValue({ id: "ar-1" })
    mockSetStatus.mockResolvedValue({ id: "ar-1" })

    await enableAutomatedResponse(
      { workspaceId: "ws-1", id: "ar-1", type: "outbound" },
      { status: true },
    )

    expect(mockFindOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "ar-1",
      type: "outbound",
    })
    expect(mockSetStatus).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "ar-1", type: "outbound" },
      true,
    )
  })

  test("deleteAutomatedResponseAction scopes the bulk delete by the caller's type", async () => {
    mockDeleteMany.mockResolvedValue(undefined)

    await deleteAutomatedResponseAction({
      bindArgsParsedInputs: ["ws-1", "outbound"],
      parsedInput: { ids: ["ar-1", "ar-2"] },
    } as never)

    expect(mockDeleteMany).toHaveBeenCalledWith(
      "ws-1",
      ["ar-1", "ar-2"],
      "outbound",
    )
  })
})
