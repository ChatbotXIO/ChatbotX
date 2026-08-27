import type {
  AIAgentModel,
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { ModelMessage } from "ai"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { replyByAI } from "../src/integration/handlers/automated-response/replies"

// ---------------------------------------------------------------------------
// Regression coverage for the shared `trackingContextRef` "send once" guard:
// the `sendMessage` system tool can be invoked more than once by the model in
// a single multi-step run (stopWhen: stepCountIs(5)) — tracking must attach
// to at most one of those sends, not one per invocation.
// ---------------------------------------------------------------------------

const sendMessageAndWaitMock = vi.hoisted(() => vi.fn(async () => undefined))
const appendHistoryMock = vi.hoisted(() => vi.fn(async () => undefined))
const createAIProviderInstanceMock = vi.hoisted(() =>
  vi.fn(() => () => ({ type: "fake-model" })),
)
const getAIIntegrationInDBMock = vi.hoisted(() =>
  vi.fn(async () => ({ id: "integration-1", apiKey: "key" })),
)

// Captures the resolved `systemFunctionContextGetter()` result so tests can
// invoke `sendMessage` directly, simulating the AI SDK calling the tool.
const capturedContext = vi.hoisted(() => ({
  current: null as null | { sendMessage: (text: string) => Promise<void> },
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiProviders: { openai: "openai" },
  aiTimeouts: { aiTotal: 30_000, aiStep: 10_000, aiChunk: 5000 },
  helpTexts: {
    richResponseFormat: "",
    unavailable: "Sorry, I cannot help right now.",
    fallbackLookup: "fallback",
  },
  processStreamingText: vi.fn(async () => ({ fullText: "", messageCount: 0 })),
  systemFunctionNames: {
    webSearch: "webSearch",
    connectUserToHuman: "connectUserToHuman",
    documentReader: "documentReader",
    imageReader: "imageReader",
    urlReader: "urlReader",
  },
  toolPrefixes: { enum: { sys: "sys", file: "file", fn: "fn", mcp: "mcp" } },
  appendFabricationGuard: (p: string) => p,
  appendHandoffPolicy: (p: string) => p,
  appendKnowledgeBaseGuard: (p: string) => p,
  appendToolOutputGuard: (p: string) => p,
  appendUnavailableWebSearchPolicy: (p: string) => p,
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  aiContextService: { appendHistory: appendHistoryMock },
  appendFabricationGuard: (p: string) => p,
  appendHandoffPolicy: (p: string) => p,
  appendKnowledgeBaseGuard: (p: string) => p,
  appendToolOutputGuard: (p: string) => p,
  appendUnavailableWebSearchPolicy: (p: string) => p,
  createAIProviderInstance: createAIProviderInstanceMock,
  createOpenaiCompatibleModelInstance: vi.fn(),
  getAIIntegrationInDB: getAIIntegrationInDBMock,
  getAIToolset: vi.fn(
    async (options: {
      systemFunctionContextGetter: () => Promise<{
        sendMessage: (text: string) => Promise<void>
      }>
    }) => {
      capturedContext.current = await options.systemFunctionContextGetter()
      return { tools: {}, cleanup: undefined, webSearchOmitReason: undefined }
    },
  ),
  McpClient: vi.fn(),
  normalizeAuthorizedWebSearchDomains: vi.fn(() => []),
  normalizeMcpContent: vi.fn((c: unknown) => c),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationOpenaiCompatibleService: {
    findByWorkspaceIdAndId: vi.fn(),
  },
}))

async function* emptyAsyncIterable() {
  // intentionally empty — fake textStream for tests
}

vi.mock("ai", () => ({
  streamText: vi.fn(async () => ({
    textStream: emptyAsyncIterable(),
    usage: Promise.resolve({ totalTokens: 0 }),
  })),
  stepCountIs: vi.fn(() => () => false),
}))

vi.mock(
  "../src/integration/handlers/automated-response/replies",
  (importOriginal) => importOriginal(),
)

vi.mock("../src/integration/utils/message", () => ({
  sendMessageAndWait: sendMessageAndWaitMock,
  sendMessageWithRender: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn(async () => []),
    replaceAll: vi.fn(async ({ text }: { text: string }) => text),
  },
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    integrationQueue: { add: vi.fn(async () => undefined) },
  }
})

vi.mock("../src/trigger/services/handoff-executor.service", () => ({
  handoffExecutorService: { execute: vi.fn(async () => undefined) },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock(
  "../src/integration/handlers/automated-response/system-tools/document-reader",
  () => ({ createDocumentReaderExecutor: vi.fn(() => vi.fn()) }),
)
vi.mock(
  "../src/integration/handlers/automated-response/system-tools/image-reader",
  () => ({ createImageReaderExecutor: vi.fn(() => vi.fn()) }),
)
vi.mock(
  "../src/integration/handlers/automated-response/system-tools/url-reader",
  () => ({ createUrlReaderExecutor: vi.fn(() => vi.fn()) }),
)

function makeAIAgent(overrides?: Partial<AIAgentModel>): AIAgentModel {
  return {
    id: "agent-1",
    workspaceId: "ws-1",
    name: "Test Agent",
    prompt: "You are a helpful assistant.",
    messages: [],
    isDefault: false,
    isRichResponse: false,
    tools: [],
    webSearchAuthorizedDomains: [],
    models: [{ provider: "openai", model: "gpt-4o" }] as AIAgentModel["models"],
    temperature: 0.7,
    maxOutputTokens: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AIAgentModel
}

function makeConversation(
  overrides?: Partial<ConversationModel>,
): ConversationModel {
  return {
    id: "conv-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
    channel: "webchat",
    status: "open",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ConversationModel
}

const baseProps = {
  conversation: makeConversation(),
  contactInbox: {
    id: "inbox-1",
    contactId: "contact-1",
    inboxId: "channel-inbox-1",
    channel: "webchat",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ContactInboxModel,
  channel: "webchat",
  messages: [] as ModelMessage[],
  fileOnlyTrigger: false,
  triggerMessageId: "msg-trigger-1",
  defaultReplyFrequency: "always" as const,
}

describe("replyByAI — sendMessage tool tracking-context guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedContext.current = null
  })

  test("attaches tracking context to only the first of two sendMessage tool calls in one run", async () => {
    await replyByAI({ ...baseProps, aiAgent: makeAIAgent() })

    expect(capturedContext.current).not.toBeNull()

    await capturedContext.current?.sendMessage("first message")
    await capturedContext.current?.sendMessage("second message")

    expect(sendMessageAndWaitMock).toHaveBeenNthCalledWith(
      1,
      "conv-1",
      "first message",
      expect.objectContaining({
        triggerType: "bot_response_ai_agent_success",
        messageId: "msg-trigger-1",
      }),
    )
    expect(sendMessageAndWaitMock).toHaveBeenNthCalledWith(
      2,
      "conv-1",
      "second message",
      undefined,
    )
  })
})
