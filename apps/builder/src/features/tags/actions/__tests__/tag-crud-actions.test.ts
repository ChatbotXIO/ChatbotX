// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockCreate = vi.fn()
const mockSoftDelete = vi.fn()
const mockReturnValidationErrors = vi.fn((_schema, errors) => errors)

vi.mock("@chatbotx.io/business", () => ({
  tagService: {
    create: (...args: unknown[]) => mockCreate(...args),
    softDelete: (...args: unknown[]) => mockSoftDelete(...args),
  },
}))

class FakeChatbotXException extends Error {
  code: string
  constructor(message: string, code = "validation") {
    super(message)
    this.code = code
  }
}

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: FakeChatbotXException,
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
  bulkUpdateIdsRequest: {},
}))

const { createTagAction: createTagActionUntyped } = await import(
  "../create-tag-action"
)
const createTagAction = createTagActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>
const { deleteTagAction: deleteTagActionUntyped } = await import(
  "../delete-tag-action"
)
const deleteTagAction = deleteTagActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createTagAction", () => {
  test("delegates to tagService.create with the resolved workspaceId", async () => {
    mockCreate.mockResolvedValue({ data: { id: "tag-1", name: "MyTag" } })

    const result = await createTagAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { name: "MyTag" },
    } as never)

    expect(mockCreate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data: { name: "MyTag" },
    })
    expect(result).toEqual({ data: { id: "tag-1", name: "MyTag" } })
  })

  test("maps a validation exception to a field-level form error", async () => {
    mockCreate.mockRejectedValue(
      new FakeChatbotXException("Name is already taken."),
    )

    await expect(
      createTagAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { name: "MyTag" },
      } as never),
    ).rejects.toThrow("Name is already taken.")

    expect(mockReturnValidationErrors).toHaveBeenCalledWith(expect.anything(), {
      name: { _errors: ["Name is already taken."] },
    })
  })
})

describe("deleteTagAction", () => {
  test("delegates to tagService.softDelete with the resolved workspaceId and ids", async () => {
    mockSoftDelete.mockResolvedValue(undefined)

    await deleteTagAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["t1", "t2"] },
    } as never)

    expect(mockSoftDelete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["t1", "t2"],
    })
  })
})
