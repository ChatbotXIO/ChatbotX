import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

const mocks = vi.hoisted(() => ({
  aiFindBy: vi.fn(),
  logProviderError: vi.fn(async () => undefined),
  createAIModelInstance: vi.fn(),
  generateText: vi.fn(),
  outputObject: vi.fn((options: { schema: unknown }) => ({
    kind: "object",
    ...options,
  })),
  loggerError: vi.fn(),
  sendMessageWithRender: vi.fn(),
  waitForChatJobCompletion: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiTimeouts: { aiTotal: 30_000 },
}))
vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: mocks.logProviderError,
}))
vi.mock("@chatbotx.io/ai/server", () => ({
  aiIntegrationService: { findBy: mocks.aiFindBy },
  createAIModelInstance: mocks.createAIModelInstance,
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactCustomFieldModel: {
        findFirst: vi.fn(async () => ({ value: "field value" })),
      },
    },
  },
}))
vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn(async () => ({})),
    replaceAll: vi.fn(async ({ text }: { text: string }) => text),
  },
}))
vi.mock("ai", () => ({
  APICallError: { isInstance: vi.fn(() => false) },
  generateText: mocks.generateText,
  Output: { object: mocks.outputObject },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}))
vi.mock("../src/integration/utils/contact", () => ({
  saveResultToCustomField: vi.fn(),
}))
vi.mock("../src/integration/utils/message", () => ({
  sendMessageWithRender: mocks.sendMessageWithRender,
  waitForChatJobCompletion: mocks.waitForChatJobCompletion,
}))

const { handleAIExtractData } = await import(
  "../src/integration/handlers/extract-data/index"
)

const makeProps = (
  provider = "openai",
): Parameters<typeof handleAIExtractData>[0] =>
  ({
    conversation: {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
    },
    contactInbox: {
      id: "contact-inbox-1",
      contactId: "contact-1",
      sourceId: "psid-1",
    },
    step: {
      id: "step-1",
      stepType: "aiExtractData",
      provider,
      model: "gpt-test",
      inputType: "text",
      inputFieldId: "message body",
      extractFields: [
        {
          key: "email",
          description: "Email",
          customFieldId: "field-1",
        },
      ],
    },
  }) as never

describe("handleAIExtractData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.aiFindBy.mockResolvedValue({ id: "ai-1" })
    mocks.createAIModelInstance.mockReturnValue("model")
    mocks.generateText.mockRejectedValue(new Error("ai failed"))
    mocks.sendMessageWithRender.mockResolvedValue({
      waitUntilFinished: vi.fn(),
    })
    mocks.waitForChatJobCompletion.mockResolvedValue(undefined)
  })

  test("waits for the error message delivery on extraction failure", async () => {
    const fakeJob = { waitUntilFinished: vi.fn() }
    let releaseWait!: () => void
    const waitPromise = new Promise<void>((resolve) => {
      releaseWait = resolve
    })
    mocks.sendMessageWithRender.mockResolvedValueOnce(fakeJob)
    mocks.waitForChatJobCompletion.mockReturnValueOnce(waitPromise)

    let resolved = false
    const resultPromise = handleAIExtractData(makeProps()).then((result) => {
      resolved = true
      return result
    })

    await vi.waitFor(() =>
      expect(mocks.sendMessageWithRender).toHaveBeenCalledWith(
        "conv-1",
        "Error extracting data",
      ),
    )
    expect(mocks.waitForChatJobCompletion).toHaveBeenCalledWith(fakeJob, {
      conversationId: "conv-1",
    })
    expect(resolved).toBe(false)

    releaseWait()
    await expect(resultPromise).resolves.toMatchObject({
      status: "error",
      result: null,
    })
  })

  test("keeps an automatic broadcast extraction failure in bulk delivery", async () => {
    const metadata = { type: "broadcast", broadcastId: "broadcast-1" }

    await handleAIExtractData({
      ...makeProps(),
      metadata,
      isBulkBroadcast: true,
    })

    expect(mocks.sendMessageWithRender).toHaveBeenCalledWith(
      "conv-1",
      "Error extracting data",
      undefined,
      { metadata, isBulkBroadcast: true },
    )
  })

  // The step knows which vendor it ran against; recording every AI failure as
  // OpenAI is the mis-attribution `ErrorLog` exists to avoid.
  test("attributes the failure to the vendor the step actually ran against", async () => {
    await handleAIExtractData(makeProps("claude"))

    expect(mocks.logProviderError).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "claude",
        workspaceId: "ws-1",
        contactId: "contact-1",
      }),
    )
  })

  test("sends image input as a v7 file part", async () => {
    mocks.generateText.mockResolvedValue({ output: { email: "a@b.test" } })
    const props = makeProps()

    await expect(
      handleAIExtractData({
        ...props,
        step: { ...props.step, inputType: "image" },
      }),
    ).resolves.toMatchObject({
      result: { email: "a@b.test" },
      status: "success",
    })

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                data: "field value",
                mediaType: "image/*",
                type: "file",
              }),
            ]),
          }),
        ],
      }),
    )
  })

  test("attributes a schema mismatch to the provider and returns an error", async () => {
    mocks.generateText.mockResolvedValue({
      get output() {
        throw new Error("No output generated")
      },
    })

    await expect(
      handleAIExtractData(makeProps("claude")),
    ).resolves.toMatchObject({ status: "error", result: null })
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ kind: "object" }),
      }),
    )
    expect(mocks.logProviderError).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "claude", workspaceId: "ws-1" }),
    )
  })
})

describe("handleAIExtractData with Muse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.aiFindBy.mockResolvedValue({ id: "ai-1" })
    mocks.createAIModelInstance.mockReturnValue("model")
  })

  test("resolves the Muse integration and model for the step", async () => {
    mocks.generateText.mockResolvedValue({ output: { email: "a@b.test" } })
    const props = makeProps("muse")

    await expect(
      handleAIExtractData({
        ...props,
        step: { ...props.step, model: "muse-spark-1.3" },
      }),
    ).resolves.toMatchObject({ status: "success" })

    expect(mocks.aiFindBy).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", provider: "muse" }),
    )
    expect(mocks.createAIModelInstance).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "muse", modelId: "muse-spark-1.3" }),
    )
  })

  // Meta's strict json_schema mode rejects a schema whose properties are not
  // all listed in `required` (`.optional()` fields → 400).
  test("sends a structured output schema that lists every key as required", async () => {
    mocks.generateText.mockResolvedValue({ output: { email: null } })

    await handleAIExtractData(makeProps("muse"))

    const [{ schema }] = mocks.outputObject.mock.calls[0] as [
      { schema: Parameters<typeof z.toJSONSchema>[0] },
    ]
    const jsonSchema = z.toJSONSchema(schema) as {
      properties: Record<string, unknown>
      required?: string[]
    }
    expect(jsonSchema.required).toEqual(Object.keys(jsonSchema.properties))
  })

  test("attributes a Muse failure to the muse provider", async () => {
    mocks.generateText.mockRejectedValue(new Error("ai failed"))

    await handleAIExtractData(makeProps("muse"))

    expect(mocks.logProviderError).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "muse", workspaceId: "ws-1" }),
    )
  })
})
