import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  assertNotRateLimited: vi.fn(),
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

const { ChatbotXException, AIFileCreateException } = vi.hoisted(() => {
  class ChatbotXException extends Error {
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
  }
  class AIFileCreateException extends ChatbotXException {
    readonly reason: string
    readonly maxBytes?: number
    constructor(message: string, reason: string) {
      super(message, "businessError", 400)
      this.reason = reason
      if (reason === "fileTooLarge") {
        this.maxBytes = 25 * 1024 * 1024
      }
    }
  }
  return { ChatbotXException, AIFileCreateException }
})

vi.mock("@chatbotx.io/business", () => ({
  aiFileService: { create: mocks.create },
  AIFileCreateException,
}))

vi.mock("@chatbotx.io/business/errors", () => ({ ChatbotXException }))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(
    async () => (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  ),
}))

vi.mock("../src/features/ai-files/lib/rate-limit", () => ({
  assertAIFileActionNotRateLimited: mocks.assertNotRateLimited,
}))

vi.mock("../src/features/ai-files/schema", () => ({
  createAIFileFromUrlRequest: {},
}))

const { createAIFileFromUrlAction } = await import(
  "@/features/ai-files/actions/create-ai-file-from-url.action"
)

const workspaceId = "workspace-1"
const parsedInput = { name: "Handbook", url: "https://example.com/a.pdf" }

const callAction = (): Promise<unknown> =>
  (
    createAIFileFromUrlAction as unknown as (props: {
      parsedInput: typeof parsedInput
      bindArgsParsedInputs: [string]
    }) => Promise<unknown>
  )({ parsedInput, bindArgsParsedInputs: [workspaceId] })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertNotRateLimited.mockResolvedValue(undefined)
})

describe("createAIFileFromUrlAction", () => {
  test("checks the shared create bucket, then creates from the url", async () => {
    mocks.create.mockResolvedValue({
      id: "file-1",
      processingRun: { error: null },
    })

    await expect(callAction()).resolves.toEqual({
      id: "file-1",
      processingRunError: null,
    })
    expect(mocks.assertNotRateLimited).toHaveBeenCalledWith(
      "create",
      workspaceId,
    )
    expect(mocks.create).toHaveBeenCalledWith(workspaceId, parsedInput)
    expect(mocks.assertNotRateLimited.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("a rate-limited call never reaches the service", async () => {
    mocks.assertNotRateLimited.mockRejectedValue(
      new ChatbotXException(
        "aiFiles.create.rateLimited",
        "tooManyRequests",
        429,
      ),
    )

    await expect(callAction()).rejects.toMatchObject({
      message: "aiFiles.create.rateLimited",
      httpStatusCode: 429,
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("translates a refusal by its reason and keeps code and status", async () => {
    mocks.create.mockRejectedValue(
      new AIFileCreateException(
        "This Google file is not shared publicly",
        "googleFileNotPublic",
      ),
    )

    await expect(callAction()).rejects.toMatchObject({
      message: "aiFiles.create.errors.googleFileNotPublic",
      code: "businessError",
      httpStatusCode: 400,
    })
  })

  test("formats maxSize for fileTooLarge", async () => {
    mocks.create.mockRejectedValue(
      new AIFileCreateException("File exceeds", "fileTooLarge"),
    )

    await expect(callAction()).rejects.toMatchObject({
      message: 'aiFiles.create.errors.fileTooLarge {"maxSize":"25 MB"}',
    })
  })

  test("rethrows an error with an unknown reason unchanged", async () => {
    const error = new AIFileCreateException("Odd", "somethingNew")
    mocks.create.mockRejectedValue(error)

    await expect(callAction()).rejects.toBe(error)
  })

  test("translates noEmbeddingProvider", async () => {
    mocks.create.mockRejectedValue(
      new ChatbotXException("No embedding provider", "noEmbeddingProvider"),
    )

    await expect(callAction()).rejects.toMatchObject({
      message: "aiFiles.noEmbeddingProvider",
    })
  })
})
