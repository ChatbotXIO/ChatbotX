import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aiFindBy: vi.fn(),
  createAIModelInstance: vi.fn(),
  generateObject: vi.fn(),
  loggerError: vi.fn(),
  sendMessageWithRender: vi.fn(),
  waitForChatJobCompletion: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiTimeouts: { aiTotal: 30_000 },
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
  generateObject: mocks.generateObject,
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

const makeProps = () =>
  ({
    conversation: {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
    },
    step: {
      id: "step-1",
      stepType: "aiExtractData",
      provider: "openai",
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
    mocks.generateObject.mockRejectedValue(new Error("ai failed"))
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
})
