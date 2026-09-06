import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@chatbotx.io/business", () => ({
  aiFileService: {
    create: mocks.create,
    delete: mocks.delete,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code = "systemError"
    httpStatusCode = 400

    constructor(message: string, code?: string, httpStatusCode?: number) {
      super(message)
      this.name = "ChatbotXException"
      if (code) {
        this.code = code
      }
      if (httpStatusCode) {
        this.httpStatusCode = httpStatusCode
      }
    }
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  zodBigintAsString: () => "mocked-schema",
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("../src/features/ai-files/schema", () => ({
  createAIFileRequest: {},
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { createAIFileAction } = await import(
  "@/features/ai-files/actions/create-ai-file.action"
)
const { deleteAIFileAction } = await import(
  "@/features/ai-files/actions/delete-ai-file.action"
)

type ActionHandler<TParsedInput, TBindArgs extends unknown[]> = (props: {
  parsedInput: TParsedInput
  bindArgsParsedInputs: TBindArgs
}) => Promise<unknown>

const workspaceId = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createAIFileAction", () => {
  test("forwards workspaceId + parsedInput to aiFileService.create", async () => {
    mocks.create.mockResolvedValue({ id: "file-1" })

    await (
      createAIFileAction as unknown as ActionHandler<
        { name: string; path: string; mimeType: string; size: number },
        [string]
      >
    )({
      parsedInput: {
        name: "manual.pdf",
        path: "path/to/file",
        mimeType: "application/pdf",
        size: 100,
      },
      bindArgsParsedInputs: [workspaceId],
    })

    expect(mocks.create).toHaveBeenCalledWith({
      workspaceId,
      name: "manual.pdf",
      path: "path/to/file",
      mimeType: "application/pdf",
      size: 100,
    })
  })

  test("translates a noEmbeddingProvider service error", async () => {
    mocks.create.mockRejectedValue(
      new ChatbotXException(
        "AI file requires an embedding provider",
        "noEmbeddingProvider",
        400,
      ),
    )

    await expect(
      (
        createAIFileAction as unknown as ActionHandler<
          { name: string; path: string; mimeType: string; size: number },
          [string]
        >
      )({
        parsedInput: {
          name: "manual.pdf",
          path: "path/to/file",
          mimeType: "application/pdf",
          size: 100,
        },
        bindArgsParsedInputs: [workspaceId],
      }),
    ).rejects.toMatchObject({ message: "noEmbeddingProvider" })
  })

  test("rethrows other service errors untranslated", async () => {
    mocks.create.mockRejectedValue(new Error("db exploded"))

    await expect(
      (
        createAIFileAction as unknown as ActionHandler<
          { name: string; path: string; mimeType: string; size: number },
          [string]
        >
      )({
        parsedInput: {
          name: "manual.pdf",
          path: "path/to/file",
          mimeType: "application/pdf",
          size: 100,
        },
        bindArgsParsedInputs: [workspaceId],
      }),
    ).rejects.toMatchObject({ message: "db exploded" })
  })
})

describe("deleteAIFileAction", () => {
  test("forwards workspaceId + id to aiFileService.delete", async () => {
    await (
      deleteAIFileAction as unknown as ActionHandler<
        undefined,
        [string, string]
      >
    )({
      parsedInput: undefined,
      bindArgsParsedInputs: [workspaceId, "file-1"],
    })

    expect(mocks.delete).toHaveBeenCalledWith({ workspaceId, id: "file-1" })
  })
})
