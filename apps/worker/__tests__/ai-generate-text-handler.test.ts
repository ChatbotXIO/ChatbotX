import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  buildAIMessages: vi.fn(),
  getAIToolset: vi.fn(),
  logStepProviderError: vi.fn(),
  processStreamingText: vi.fn(),
  resolveFlowAIModel: vi.fn(),
  saveResultToCustomField: vi.fn(),
  streamText: vi.fn(),
}))

class FakeAPICallError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
  }
  static isInstance(error: unknown): error is FakeAPICallError {
    return error instanceof FakeAPICallError
  }
}

vi.mock("@chatbotx.io/ai", () => ({
  helpTexts: {},
  processStreamingText: mocks.processStreamingText,
  toolPrefixes: { enum: {} },
}))
vi.mock("@chatbotx.io/ai/server", () => ({
  getAIToolset: mocks.getAIToolset,
  McpClient: vi.fn(),
  normalizeMcpContent: vi.fn(),
}))
vi.mock("@chatbotx.io/database/errors", () => ({
  isMessageStorageError: () => false,
}))
vi.mock("ai", () => ({
  APICallError: FakeAPICallError,
  streamText: mocks.streamText,
}))
vi.mock("../src/integration/utils/contact", () => ({
  saveResultToCustomField: mocks.saveResultToCustomField,
}))
vi.mock("../src/integration/handlers/flow-utils", () => ({
  logStepProviderError: mocks.logStepProviderError,
}))
vi.mock("../src/integration/handlers/shared/ai-error-log-provider", () => ({
  aiErrorLogProvider: (provider: string) => provider,
}))
vi.mock("../src/integration/handlers/shared/flow-ai-model-resolver", () => ({
  resolveFlowAIModel: mocks.resolveFlowAIModel,
}))
vi.mock("../src/integration/handlers/shared/resolve-mcp-token", () => ({
  createMcpTokenResolver: vi.fn(),
}))
vi.mock("../src/integration/handlers/generate-text/messages", () => ({
  buildAIMessages: mocks.buildAIMessages,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const { handleAIGenerateText } = await import(
  "../src/integration/handlers/generate-text"
)

const props = {
  contactInbox: { contactId: "contact-1", id: "contact-inbox-1" },
  conversation: {
    contactId: "contact-1",
    id: "conversation-1",
    workspaceId: "workspace-1",
  },
  step: {
    id: "step-1",
    maxOutputTokens: 500,
    model: "muse-spark-1.3",
    outputFieldId: "field-1",
    provider: "muse",
    remember: false,
    states: [] as never,
    stepType: "aiGenerateText",
    temperature: 0.2,
    text: "Hello",
    tools: [],
  } satisfies AIGenerateTextSchema,
} as unknown as Parameters<typeof handleAIGenerateText>[0]

/** The SDK reports a stream error through onError; textStream ends empty. */
const failStreamWith = (error: unknown) => {
  mocks.streamText.mockImplementation(
    (options: { onError: (event: { error: unknown }) => void }) => {
      // Like the SDK, swallow a throw from onError.
      try {
        options.onError({ error })
      } catch {
        // ignored
      }
      return { textStream: [] }
    },
  )
  mocks.processStreamingText.mockResolvedValue({ fullText: "" })
}

describe("handleAIGenerateText", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.buildAIMessages.mockResolvedValue([
      { role: "user", content: "Hello" },
    ])
    mocks.getAIToolset.mockResolvedValue({ tools: {}, cleanup: vi.fn() })
    mocks.resolveFlowAIModel.mockResolvedValue({ model: "model", ok: true })
    mocks.streamText.mockReturnValue({ textStream: [] })
    mocks.processStreamingText.mockResolvedValue({ fullText: "Hi there" })
  })

  test("saves the generated text", async () => {
    await expect(handleAIGenerateText(props)).resolves.toEqual({
      status: "success",
      result: null,
    })
    expect(mocks.saveResultToCustomField).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldId: "field-1",
        fullText: "Hi there",
      }),
    )
  })

  test("reports a provider error from the stream as a step error", async () => {
    const providerError = new FakeAPICallError(
      "The requested model was not found.",
      404,
    )
    failStreamWith(providerError)

    await expect(handleAIGenerateText(props)).resolves.toEqual({
      status: "error",
      errorMessage: "The requested model was not found.",
      result: null,
    })
    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
    expect(mocks.logStepProviderError).toHaveBeenCalledWith(
      "muse",
      expect.anything(),
      providerError,
    )
  })

  test("maps a 402 from the stream to the insufficient-credits message", async () => {
    failStreamWith(new FakeAPICallError("Payment required", 402))

    await expect(handleAIGenerateText(props)).resolves.toMatchObject({
      status: "error",
      errorMessage:
        "AI provider has insufficient credits. Please check your billing settings.",
    })
    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
  })
})
