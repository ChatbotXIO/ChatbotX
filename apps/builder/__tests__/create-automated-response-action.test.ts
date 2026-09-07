// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockCreate = vi.fn()
const mockEnsureExists = vi.fn()
const mockReturnValidationErrors = vi.fn((_schema, errors) => errors)

vi.mock("@chatbotx.io/business", () => ({
  automatedResponseService: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
  folderService: {
    ensureExists: (...args: unknown[]) => mockEnsureExists(...args),
  },
}))

class FakeChatbotXException extends Error {
  code: string
  field?: string
  constructor(message: string, code = "validation", field?: string) {
    super(message)
    this.code = code
    this.field = field
  }
}

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: FakeChatbotXException,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  automatedResponseFolderTypeByType: { keyword: "automatedResponse" },
  automatedResponseTypes: {},
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("../src/features/automated-response/schema/action", () => ({
  createAutomatedResponseRequest: {},
}))

const { createAutomatedResponseAction: createAutomatedResponseActionUntyped } =
  await import(
    "../src/features/automated-response/actions/create-automated-response-action"
  )
const createAutomatedResponseAction =
  createAutomatedResponseActionUntyped as unknown as (
    props: unknown,
  ) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createAutomatedResponseAction", () => {
  test("delegates to automatedResponseService.create with the resolved workspaceId and type", async () => {
    mockCreate.mockResolvedValue({ id: "ar-1" })

    await createAutomatedResponseAction({
      bindArgsParsedInputs: ["ws-1", "keyword"],
      parsedInput: {
        text: "hello",
        flowId: null,
        folderId: null,
        keywords: [{ value: "hi" }],
      },
    } as never)

    expect(mockCreate).toHaveBeenCalledWith("ws-1", {
      type: "keyword",
      text: "hello",
      flowId: null,
      folderId: null,
      keywords: ["hi"],
    })
  })

  test("ensures the folder exists before creating when a folderId is given", async () => {
    mockCreate.mockResolvedValue({ id: "ar-1" })

    await createAutomatedResponseAction({
      bindArgsParsedInputs: ["ws-1", "keyword"],
      parsedInput: {
        text: "hello",
        flowId: null,
        folderId: "folder-1",
        keywords: [{ value: "hi" }],
      },
    } as never)

    expect(mockEnsureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "ws-1",
      folderType: "automatedResponse",
    })
  })

  test("maps a field-scoped validation exception (e.g. flowId not found) to a form field error", async () => {
    mockCreate.mockRejectedValue(
      new FakeChatbotXException("Flow not found", "validation", "flowId"),
    )

    await expect(
      createAutomatedResponseAction({
        bindArgsParsedInputs: ["ws-1", "keyword"],
        parsedInput: {
          text: null,
          flowId: "missing-flow",
          folderId: null,
          keywords: [{ value: "hi" }],
        },
      } as never),
    ).rejects.toThrow("Flow not found")

    expect(mockReturnValidationErrors).toHaveBeenCalledWith(expect.anything(), {
      _errors: ["Validation Exception"],
      flowId: { _errors: ["Flow not found"] },
    })
  })

  test("re-throws non-validation errors without mapping", async () => {
    mockCreate.mockRejectedValue(new Error("boom"))

    await expect(
      createAutomatedResponseAction({
        bindArgsParsedInputs: ["ws-1", "keyword"],
        parsedInput: {
          text: "hello",
          flowId: null,
          folderId: null,
          keywords: [{ value: "hi" }],
        },
      } as never),
    ).rejects.toThrow("boom")

    expect(mockReturnValidationErrors).not.toHaveBeenCalled()
  })
})
