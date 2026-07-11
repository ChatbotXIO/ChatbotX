import type {
  AIAgentModel,
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { AIGenerateTextAgentSchema } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findAgentMock = vi.hoisted(() => vi.fn())
const getOrInitContextMock = vi.hoisted(() => vi.fn())
const runAIAgentRunnerMock = vi.hoisted(() => vi.fn())
const saveResultToCustomFieldMock = vi.hoisted(() => vi.fn())

vi.mock("@chatbotx.io/ai", () => ({
  aiTimeouts: { aiTotal: 30_000 },
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  aiContextService: { getOrInitContext: getOrInitContextMock },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      aiAgentModel: {
        findFirst: findAgentMock,
      },
    },
  },
}))

vi.mock("@chatbotx.io/database/errors", () => ({
  isMessageStorageError: vi.fn(() => false),
}))

vi.mock("../src/integration/handlers/shared/ai-agent-runner", () => ({
  runAIAgentRunner: runAIAgentRunnerMock,
}))

vi.mock("../src/integration/handlers/generate-text-agent/messages", () => ({
  buildAIAgentMessages: vi.fn(async () => [{ role: "user", content: "Hello" }]),
}))

vi.mock("../src/integration/utils/contact", () => ({
  saveResultToCustomField: saveResultToCustomFieldMock,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn() },
}))

const { handleAIGenerateTextAgent } = await import(
  "../src/integration/handlers/generate-text-agent"
)

function makeAgent(): AIAgentModel {
  return {
    id: "agent-1",
    workspaceId: "ws-1",
    name: "Agent",
    prompt: "Be helpful",
    messages: [],
    isDefault: false,
    isRichResponse: false,
    tools: [],
    webSearchAuthorizedDomains: [],
    models: [{ provider: "openai", model: "gpt-5.4-mini" }],
    temperature: 0.7,
    maxOutputTokens: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AIAgentModel
}

function makeConversation(): ConversationModel {
  return {
    id: "conversation-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
    channel: "webchat",
    status: "open",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ConversationModel
}

function makeContactInbox(): ContactInboxModel {
  return {
    id: "contact-inbox-1",
    contactId: "contact-1",
    inboxId: "inbox-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ContactInboxModel
}

function makeStep(
  overrides?: Partial<AIGenerateTextAgentSchema>,
): AIGenerateTextAgentSchema {
  return {
    id: "step-1",
    stepType: "aiGenerateTextAgent",
    provider: "openaiCompatible",
    integrationId: "integration-1",
    model: "local-model",
    aiAgentId: "agent-1",
    message: "Hello",
    outputFieldId: "output-field",
    rememberConversation: true,
    ...overrides,
  }
}

describe("handleAIGenerateTextAgent OpenAI-compatible provider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findAgentMock.mockResolvedValue(makeAgent())
    getOrInitContextMock.mockResolvedValue({ summary: "Summary" })
    runAIAgentRunnerMock.mockResolvedValue({
      responded: true,
      provider: "openaiCompatible",
      modelId: "local-model",
      fullText: "Agent reply",
      usedFallbackText: false,
      toolStats: {
        steps: 1,
        toolCallsCount: 0,
        toolResultsCount: 0,
        toolErrorsCount: 0,
        toolNames: [],
        finishReasons: [],
      },
    })
    saveResultToCustomFieldMock.mockResolvedValue(undefined)
  })

  test("passes preferred OpenAI-compatible model to the AI agent runner", async () => {
    const result = await handleAIGenerateTextAgent({
      conversation: makeConversation(),
      contactInbox: makeContactInbox(),
      step: makeStep(),
    } as Parameters<typeof handleAIGenerateTextAgent>[0])

    expect(result).toEqual({ status: "success", result: null })
    expect(runAIAgentRunnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredModel: {
          kind: "openaiCompatible",
          integrationId: "integration-1",
          model: "local-model",
        },
      }),
    )
    expect(saveResultToCustomFieldMock).toHaveBeenCalledWith({
      contactId: "contact-1",
      customFieldId: "output-field",
      fullText: "Agent reply",
      workspaceId: "ws-1",
    })
  })

  test("returns a clear error when OpenAI-compatible integration cannot respond", async () => {
    runAIAgentRunnerMock.mockResolvedValueOnce(null)

    const result = await handleAIGenerateTextAgent({
      conversation: makeConversation(),
      contactInbox: makeContactInbox(),
      step: makeStep(),
    } as Parameters<typeof handleAIGenerateTextAgent>[0])

    expect(result).toEqual({
      status: "error",
      errorMessage: "OpenAI-compatible integration is missing or disabled",
      result: null,
    })
    expect(saveResultToCustomFieldMock).not.toHaveBeenCalled()
  })
})
