import type {
  AIAgentModel,
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { contactVariableService } from "@chatbotx.io/variables"
import { type ModelMessage, streamText } from "ai"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { triggerDefaultReplyFlow } from "../src/integration/handlers/automated-response/default-reply"
import { replyByAI } from "../src/integration/handlers/automated-response/replies"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const findByFlowMock = vi.hoisted(() => vi.fn())
const integrationQueueAddMock = vi.hoisted(() => vi.fn(async () => undefined))
const sendMessageWithRenderMock = vi.hoisted(() => vi.fn(async () => undefined))
const sendMessageAndWaitMock = vi.hoisted(() => vi.fn(async () => undefined))
const appendHistoryMock = vi.hoisted(() => vi.fn(async () => undefined))
const warnMock = vi.hoisted(() => vi.fn())
const errorMock = vi.hoisted(() => vi.fn())

vi.mock("@chatbotx.io/business", () => ({
  flowService: { findBy: findByFlowMock },
  integrationOpenaiCompatibleService: {
    findByWorkspaceIdAndId: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    integrationQueue: { add: integrationQueueAddMock },
    chatQueue: { add: vi.fn(async () => undefined) },
  }
})

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: () => "webhook",
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: warnMock, error: errorMock, info: vi.fn() },
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiProviders: { openai: "openai" },
  aiTimeouts: { aiTotal: 30_000, aiStep: 10_000, aiChunk: 5000 },
  helpTexts: {
    fallbackLookup:
      "I've found some data, but I couldn't generate a complete answer yet.",
    unavailable: "Sorry, I cannot help right now.",
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
  createAIProviderInstance: vi.fn(() => () => ({ type: "fake-model" })),
  createOpenaiCompatibleModelInstance: vi.fn(() => ({
    type: "openai-compatible-model",
  })),
  getAIIntegrationInDB: vi.fn(async () => ({
    id: "integration-1",
    apiKey: "key",
  })),
  getAIToolset: vi.fn(async () => ({
    tools: { some_tool: {} },
    cleanup: undefined,
    webSearchOmitReason: undefined,
  })),
  McpClient: vi.fn(),
  normalizeAuthorizedWebSearchDomains: vi.fn(() => []),
  normalizeMcpContent: vi.fn((c: unknown) => c),
}))

async function* emptyAsyncIterable() {
  // intentionally empty — fake textStream for tests
}

vi.mock("ai", () => ({
  streamText: vi.fn((opts: { onStepFinish?: (info: unknown) => void }) => {
    opts.onStepFinish?.({
      stepNumber: 0,
      finishReason: "tool-calls",
      rawFinishReason: "tool-calls",
      toolCalls: [{ toolName: "some_tool" }],
      toolResults: [{}],
    })
    return Promise.resolve({
      textStream: emptyAsyncIterable(),
      usage: Promise.resolve({ totalTokens: 0 }),
    })
  }),
  stepCountIs: vi.fn(() => () => false),
}))

vi.mock(
  "../src/integration/handlers/automated-response/replies",
  (importOriginal) => importOriginal(),
)

vi.mock("../src/integration/utils/message", () => ({
  sendMessageAndWait: sendMessageAndWaitMock,
  sendMessageWithRender: sendMessageWithRenderMock,
}))

vi.mock("../../utils/message", () => ({
  sendMessageAndWait: sendMessageAndWaitMock,
  sendMessageWithRender: sendMessageWithRenderMock,
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn(async () => []),
    replaceAll: vi.fn(async ({ text }: { text: string }) => text),
  },
}))

vi.mock("../src/trigger/services/handoff-executor.service", () => ({
  handoffExecutorService: { execute: vi.fn(async () => undefined) },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(async () => undefined),
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAIAgent(overrides?: Partial<AIAgentModel>): AIAgentModel {
  return {
    id: "agent-1",
    workspaceId: "ws-1",
    name: "Test Agent",
    prompt: "You are a helpful assistant.",
    messages: [],
    isDefault: false,
    isRichResponse: false,
    tools: ["sys:some_tool"],
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

const contactInbox = {
  id: "inbox-1",
  contactId: "contact-1",
  inboxId: "channel-inbox-1",
  channel: "webchat",
  createdAt: new Date(),
  updatedAt: new Date(),
} as ContactInboxModel

const baseProps = {
  conversation: makeConversation(),
  contactInbox,
  channel: "webchat",
  messages: [] as ModelMessage[],
  fileOnlyTrigger: false,
  triggerMessageId: "msg-trigger-1",
}

beforeEach(() => {
  findByFlowMock.mockReset()
  integrationQueueAddMock.mockClear()
  sendMessageWithRenderMock.mockClear()
  sendMessageAndWaitMock.mockClear()
  appendHistoryMock.mockClear()
  warnMock.mockClear()
  errorMock.mockClear()
  vi.mocked(streamText).mockClear()
  vi.mocked(contactVariableService.replaceAll).mockClear()
})

// ---------------------------------------------------------------------------
// triggerDefaultReplyFlow — unit tests
// ---------------------------------------------------------------------------

describe("triggerDefaultReplyFlow", () => {
  const conversation = makeConversation()

  test("returns false and does not enqueue when no flow id is configured", async () => {
    const result = await triggerDefaultReplyFlow({
      workspaceId: "ws-1",
      defaultReplyFlowId: null,
      conversation,
      contactInbox,
    })

    expect(result).toBe(false)
    expect(findByFlowMock).not.toHaveBeenCalled()
    expect(integrationQueueAddMock).not.toHaveBeenCalled()
  })

  test("returns false when the configured flow no longer exists", async () => {
    findByFlowMock.mockResolvedValueOnce(undefined)

    const result = await triggerDefaultReplyFlow({
      workspaceId: "ws-1",
      defaultReplyFlowId: "flow-missing",
      conversation,
      contactInbox,
    })

    expect(result).toBe(false)
    expect(integrationQueueAddMock).not.toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalled()
  })

  test("returns false when the configured flow is inactive", async () => {
    findByFlowMock.mockResolvedValueOnce({
      id: "flow-1",
      active: false,
      currentVersionId: "v1",
    })

    const result = await triggerDefaultReplyFlow({
      workspaceId: "ws-1",
      defaultReplyFlowId: "flow-1",
      conversation,
      contactInbox,
    })

    expect(result).toBe(false)
    expect(integrationQueueAddMock).not.toHaveBeenCalled()
  })

  test("returns false when the configured flow has no published version", async () => {
    findByFlowMock.mockResolvedValueOnce({
      id: "flow-1",
      active: true,
      currentVersionId: null,
    })

    const result = await triggerDefaultReplyFlow({
      workspaceId: "ws-1",
      defaultReplyFlowId: "flow-1",
      conversation,
      contactInbox,
    })

    expect(result).toBe(false)
    expect(integrationQueueAddMock).not.toHaveBeenCalled()
  })

  test("enqueues a sendFlow job and returns true when the flow is valid", async () => {
    findByFlowMock.mockResolvedValueOnce({
      id: "flow-1",
      active: true,
      currentVersionId: "v1",
    })

    const result = await triggerDefaultReplyFlow({
      workspaceId: "ws-1",
      defaultReplyFlowId: "flow-1",
      conversation,
      contactInbox,
    })

    expect(result).toBe(true)
    expect(integrationQueueAddMock).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        type: "sendFlow",
        data: expect.objectContaining({
          conversationId: conversation.id,
          contactInboxId: contactInbox.id,
          flowId: "flow-1",
        }),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// replyByAI — last-resort fallback prefers the default reply flow
// ---------------------------------------------------------------------------

describe("replyByAI — default reply flow fallback", () => {
  test("resolves queued-message variables in the AI agent prompt", async () => {
    await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent({
        prompt: "Answer this burst:\n{{ai.queued.messages}}",
      }),
      defaultReplyFlowId: null,
    })

    expect(contactVariableService.replaceAll).toHaveBeenCalledWith({
      text: "Answer this burst:\n{{ai.queued.messages}}",
      variables: expect.anything(),
    })
  })

  test("triggers the default reply flow instead of the canned fallback text when configured and valid", async () => {
    findByFlowMock.mockResolvedValueOnce({
      id: "flow-1",
      active: true,
      currentVersionId: "v1",
    })

    const result = await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent(),
      defaultReplyFlowId: "flow-1",
    })

    expect(result?.usedFallbackText).toBe(true)
    expect(integrationQueueAddMock).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({ flowId: "flow-1" }),
      }),
    )
    expect(sendMessageWithRenderMock).not.toHaveBeenCalled()
  })

  test("falls back to the canned help text when no default reply flow is configured", async () => {
    const result = await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent(),
      defaultReplyFlowId: null,
    })

    expect(result?.usedFallbackText).toBe(true)
    expect(integrationQueueAddMock).not.toHaveBeenCalled()
    expect(sendMessageWithRenderMock).toHaveBeenCalledWith(
      baseProps.conversation.id,
      expect.stringContaining("I've found some data"),
    )
  })

  test("falls back to the canned help text when the configured default reply flow is invalid", async () => {
    findByFlowMock.mockResolvedValueOnce(undefined)

    const result = await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent(),
      defaultReplyFlowId: "flow-missing",
    })

    expect(result?.usedFallbackText).toBe(true)
    expect(integrationQueueAddMock).not.toHaveBeenCalled()
    expect(sendMessageWithRenderMock).toHaveBeenCalledWith(
      baseProps.conversation.id,
      expect.stringContaining("I've found some data"),
    )
  })
})
