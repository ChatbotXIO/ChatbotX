import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
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

type ActionHandler<TParsedInput, TBindArgs extends unknown[]> = (props: {
  parsedInput: TParsedInput
  bindArgsParsedInputs: TBindArgs
}) => Promise<unknown>

const workspaceId = "workspace-1"
const parsedInput = {
  name: "manual.pdf",
  path: "path/to/file",
  mimeType: "application/pdf",
  size: 100,
}

const callAction = (
  bindArgsParsedInputs: [string] = [workspaceId],
): Promise<unknown> =>
  (
    createAIFileAction as unknown as ActionHandler<typeof parsedInput, [string]>
  )({ parsedInput, bindArgsParsedInputs })

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createAIFileAction", () => {
  test("translates a noEmbeddingProvider service error via next-intl", async () => {
    mocks.create.mockRejectedValue(
      new ChatbotXException(
        "AI file requires an embedding provider",
        "noEmbeddingProvider",
        400,
      ),
    )

    await expect(callAction()).rejects.toMatchObject({
      message: "noEmbeddingProvider",
    })
  })

  test("rethrows any other service error untranslated", async () => {
    mocks.create.mockRejectedValue(new Error("db exploded"))

    await expect(callAction()).rejects.toMatchObject({
      message: "db exploded",
    })
  })
})
