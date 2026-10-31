import type { AIAnalyzeImageSchema } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isImageUrl: vi.fn(),
  logStepProviderError: vi.fn(),
  processStreamingText: vi.fn(),
  readCustomFieldValue: vi.fn(),
  resolveFlowAIModel: vi.fn(),
  saveResultToCustomField: vi.fn(),
  streamText: vi.fn(),
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiTimeouts: { aiTotal: 30_000 },
  isImageUrl: mocks.isImageUrl,
  processStreamingText: mocks.processStreamingText,
}))
vi.mock("ai", () => ({ streamText: mocks.streamText }))
vi.mock("../src/integration/utils/contact", () => ({
  readCustomFieldValue: mocks.readCustomFieldValue,
  saveResultToCustomField: mocks.saveResultToCustomField,
}))
vi.mock("../src/integration/handlers/flow-utils", () => ({
  logStepProviderError: mocks.logStepProviderError,
}))
vi.mock("../src/integration/handlers/shared/ai-error-log-provider", () => ({
  aiErrorLogProvider: vi.fn((provider: string) => provider),
}))
vi.mock("../src/integration/handlers/shared/flow-ai-model-resolver", () => ({
  resolveFlowAIModel: mocks.resolveFlowAIModel,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const { handleAIAnalyzeImage } = await import(
  "../src/integration/handlers/analyze-image"
)

const props: Parameters<typeof handleAIAnalyzeImage>[0] = {
  contactInbox: {
    contactId: "contact-1",
    id: "contact-inbox-1",
  },
  conversation: {
    contactId: "contact-1",
    id: "conversation-1",
    workspaceId: "workspace-1",
  },
  step: {
    id: "step-1",
    inputFieldId: "field-1",
    maxOutputTokens: 500,
    model: "gpt-vision",
    outputFieldId: null,
    prompt: "Describe the image",
    provider: "openai",
    stepType: "aiAnalyzeImage",
    temperature: 0.2,
  } satisfies AIAnalyzeImageSchema,
} as Parameters<typeof handleAIAnalyzeImage>[0]

describe("handleAIAnalyzeImage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isImageUrl.mockReturnValue(true)
    mocks.processStreamingText.mockResolvedValue({ fullText: "description" })
    mocks.readCustomFieldValue.mockResolvedValue(
      "https://cdn.example/image.jpg",
    )
    mocks.resolveFlowAIModel.mockResolvedValue({
      model: "vision-model",
      ok: true,
    })
    mocks.streamText.mockReturnValue({ textStream: [] })
  })

  test("sends custom-field image URLs as v7 file parts", async () => {
    await expect(handleAIAnalyzeImage(props)).resolves.toMatchObject({
      status: "success",
    })

    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe the image" },
              {
                data: "https://cdn.example/image.jpg",
                mediaType: "image/*",
                type: "file",
              },
            ],
          },
        ],
      }),
    )
  })

  test("reports a provider error from the stream as a step error", async () => {
    const providerError = new Error("The requested model was not found.")
    // The SDK reports stream errors through onError and drops them from
    // textStream, which then ends empty.
    mocks.streamText.mockImplementation(
      (options: { onError: (event: { error: unknown }) => void }) => {
        // Like the SDK, swallow a throw from onError.
        try {
          options.onError({ error: providerError })
        } catch {
          // ignored
        }
        return { textStream: [] }
      },
    )
    mocks.processStreamingText.mockResolvedValue({ fullText: "" })

    await expect(
      handleAIAnalyzeImage({
        ...props,
        step: { ...props.step, outputFieldId: "field-2" },
      }),
    ).resolves.toEqual({
      status: "error",
      errorMessage: "The requested model was not found.",
      result: null,
    })
    expect(mocks.saveResultToCustomField).not.toHaveBeenCalled()
    expect(mocks.logStepProviderError).toHaveBeenCalledWith(
      "openai",
      expect.anything(),
      providerError,
    )
  })
})
