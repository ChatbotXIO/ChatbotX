import type {
  AIAgentModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { type ModelMessage, streamText } from "ai"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { replyByAI } from "../src/integration/handlers/automated-response/replies"

// ---------------------------------------------------------------------------
// Mutable per-test state
// ---------------------------------------------------------------------------

const state = {
  aiResponseText: "",
}

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const sendMessageAndWaitMock = vi.hoisted(() => vi.fn(async () => undefined))
const sendRichMessagesMock = vi.hoisted(() =>
  vi.fn(async () => ({ enqueued: 1, skipped: 0 })),
)
const executeRichActionsMock = vi.hoisted(() =>
  vi.fn(async () => ({ executed: 0, failed: [] })),
)
const appendHistoryMock = vi.hoisted(() => vi.fn(async () => undefined))
const emitMock = vi.hoisted(() => vi.fn(async () => undefined))
const warnMock = vi.hoisted(() => vi.fn())
const errorMock = vi.hoisted(() => vi.fn())
const richResponseFormatMock = vi.hoisted(() =>
  [
    "RICH RESPONSE FORMAT (REQUIRED):",
    "Output must be exactly one JSON object",
    "Do not repeat message text, summaries, explanations, or confirmations outside the JSON object",
    "Never answer with plain text in rich-response mode",
    "Quick reply example for an option-selection question",
    "Delay example as a complete response",
    '{"messages":[{"message":{"text":"First"}},3,{"message":{"text":"Second after 3s"}}],"actions":[]}',
    '"quick_replies"',
    'keep "actions": [] unless the user explicitly selected an option',
    "Do NOT use WhatsApp-native interactive/list/catalog/location payloads",
  ].join("\n"),
)

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/ai", () => ({
  aiProviders: { openai: "openai" },
  aiTimeouts: { aiTotal: 30_000, aiStep: 10_000, aiChunk: 5000 },
  helpTexts: {
    richResponseFormat: richResponseFormatMock,
    unavailable: "Sorry, I cannot help right now.",
  },
  processStreamingText: vi.fn(async () => ({
    fullText: state.aiResponseText,
    messageCount: state.aiResponseText ? 1 : 0,
  })),
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
  getAIIntegrationInDB: vi.fn(async () => ({
    id: "integration-1",
    apiKey: "key",
  })),
  getAIToolset: vi.fn(async () => ({
    tools: {},
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

vi.mock("../src/integration/handlers/rich-response/message-sender", () => ({
  sendRichMessages: sendRichMessagesMock,
}))

vi.mock("../src/integration/handlers/rich-response/action-executor", () => ({
  executeRichActions: executeRichActionsMock,
}))

vi.mock("../src/integration/handlers/rich-response", (importOriginal) =>
  importOriginal(),
)

vi.mock("../../utils/message", () => ({
  sendMessageAndWait: sendMessageAndWaitMock,
  sendMessageWithRender: vi.fn(async () => undefined),
}))

vi.mock("../src/integration/utils/message", () => ({
  sendMessageAndWait: sendMessageAndWaitMock,
  sendMessageWithRender: vi.fn(async () => undefined),
}))

vi.mock("../src/chat/handlers/send-message", () => ({
  sendMessageAndWait: sendMessageAndWaitMock,
  sendMessageWithRender: vi.fn(async () => undefined),
}))

vi.mock("../src/integration/handlers/automated-response/utils/message", () => ({
  sendMessageAndWait: sendMessageAndWaitMock,
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
    chatQueue: { add: vi.fn(async () => undefined) },
  }
})

vi.mock("../src/trigger/services/handoff-executor.service", () => ({
  handoffExecutorService: { execute: vi.fn(async () => undefined) },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: warnMock, error: errorMock, info: vi.fn() },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: emitMock,
}))

vi.mock("../src/integration/handlers/contact", () => ({
  attachTagsByNames: vi.fn(async () => undefined),
  detachTagsByNames: vi.fn(async () => undefined),
}))

vi.mock(
  "../src/integration/handlers/automated-response/system-tools/document-reader",
  () => ({
    createDocumentReaderExecutor: vi.fn(() => vi.fn()),
  }),
)

vi.mock(
  "../src/integration/handlers/automated-response/system-tools/image-reader",
  () => ({
    createImageReaderExecutor: vi.fn(() => vi.fn()),
  }),
)

vi.mock(
  "../src/integration/handlers/automated-response/system-tools/url-reader",
  () => ({
    createUrlReaderExecutor: vi.fn(() => vi.fn()),
  }),
)

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeAIAgent(overrides?: Partial<AIAgentModel>): AIAgentModel {
  return {
    id: "agent-1",
    workspaceId: "ws-1",
    name: "Test Agent",
    prompt: "You are a helpful assistant.",
    messages: [],
    isDefault: false,
    isRichResponse: true,
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
  contactInboxId: "inbox-1",
  channel: "webchat",
  messages: [] as ModelMessage[],
  fileOnlyTrigger: false,
  triggerMessageId: "msg-trigger-1",
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("replyByAI — rich mode routing", () => {
  beforeEach(() => {
    state.aiResponseText = ""
    sendMessageAndWaitMock.mockClear()
    sendRichMessagesMock.mockClear().mockResolvedValue({
      enqueued: 1,
      skipped: 0,
    })
    executeRichActionsMock.mockClear()
    appendHistoryMock.mockClear()
    emitMock.mockClear()
    warnMock.mockClear()
    vi.mocked(streamText).mockClear()
  })

  test("rich mode appends strict JSON contract with quick reply example", async () => {
    state.aiResponseText = JSON.stringify({
      messages: [{ message: { text: "Hello!" } }],
      actions: [],
    })

    await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent({ isRichResponse: true }),
    })

    const systemPrompt = vi.mocked(streamText).mock.calls[0]?.[0].system

    expect(systemPrompt).toContain("RICH RESPONSE FORMAT (REQUIRED)")
    expect(systemPrompt).toContain("Output must be exactly one JSON object")
    expect(systemPrompt).toContain(
      "Do not repeat message text, summaries, explanations, or confirmations outside the JSON object",
    )
    expect(systemPrompt).toContain(
      "Never answer with plain text in rich-response mode",
    )
    expect(systemPrompt).toContain(
      "Quick reply example for an option-selection question",
    )
    expect(systemPrompt).toContain("Delay example as a complete response")
    expect(systemPrompt).toContain(
      '{"messages":[{"message":{"text":"First"}},3,{"message":{"text":"Second after 3s"}}],"actions":[]}',
    )
    expect(systemPrompt).toContain('"quick_replies"')
    expect(systemPrompt).toContain(
      'keep "actions": [] unless the user explicitly selected an option',
    )
    expect(systemPrompt?.trim()).toContain(
      "Do NOT use WhatsApp-native interactive/list/catalog/location payloads",
    )
  })

  test("valid JSON response → sendRichMessages + executeRichActions called, responded: true", async () => {
    state.aiResponseText = JSON.stringify({
      messages: [{ message: { text: "Hello!" } }],
      actions: [{ action: "add_tag", tag_name: "lead" }],
    })

    const result = await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent({ isRichResponse: true }),
    })

    expect(result?.responded).toBe(true)
    expect(sendRichMessagesMock).toHaveBeenCalledOnce()
    expect(sendRichMessagesMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      expect.objectContaining({
        conversationId: baseProps.conversation.id,
        messageId: baseProps.triggerMessageId,
        responseType: "ai_agent",
        workspaceId: baseProps.conversation.workspaceId,
      }),
    )
    expect(executeRichActionsMock).toHaveBeenCalledOnce()
    expect(sendMessageAndWaitMock).not.toHaveBeenCalled()
    expect(appendHistoryMock).toHaveBeenCalledOnce()
  })

  test("plain_text AI response → sendMessageAndWait called, responded: true", async () => {
    state.aiResponseText = "I can help you with that!"

    const result = await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent({ isRichResponse: true }),
    })

    expect(result?.responded).toBe(true)
    expect(sendMessageAndWaitMock).toHaveBeenCalledWith(
      "conv-1",
      "I can help you with that!",
      expect.objectContaining({
        messageId: baseProps.triggerMessageId,
        responseType: "ai_agent",
        workspaceId: baseProps.conversation.workspaceId,
      }),
    )
    expect(sendRichMessagesMock).not.toHaveBeenCalled()
    expect(executeRichActionsMock).not.toHaveBeenCalled()
    expect(appendHistoryMock).toHaveBeenCalledOnce()
  })

  test("schema_error JSON response → null returned, no messages sent", async () => {
    // Valid JSON but wrong schema (missing messages AND actions)
    state.aiResponseText = JSON.stringify({ unrelated_key: "value" })

    const result = await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent({ isRichResponse: true }),
    })

    expect(result).toBeNull()
    expect(sendMessageAndWaitMock).not.toHaveBeenCalled()
    expect(sendRichMessagesMock).not.toHaveBeenCalled()
  })

  test("missing triggerMessageId → rich mode disabled warning logged", async () => {
    state.aiResponseText = "Some streaming response"

    await replyByAI({
      ...baseProps,
      triggerMessageId: undefined,
      aiAgent: makeAIAgent({ isRichResponse: true }),
    })

    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "missing_rich_response_execution_id" }),
      expect.any(String),
    )
  })

  test("isRichResponse=false → normal streaming path, rich modules not called", async () => {
    state.aiResponseText = "Plain streaming text"

    await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent({ isRichResponse: false }),
    })

    expect(sendRichMessagesMock).not.toHaveBeenCalled()
    expect(executeRichActionsMock).not.toHaveBeenCalled()
  })

  test("valid JSON actions-only response → sendRichMessages not called, executeRichActions called", async () => {
    state.aiResponseText = JSON.stringify({
      actions: [{ action: "add_tag", tag_name: "hot-lead" }],
    })
    executeRichActionsMock.mockResolvedValueOnce({ executed: 1, failed: [] })

    const result = await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent({ isRichResponse: true }),
    })

    expect(result?.responded).toBe(true)
    expect(executeRichActionsMock).toHaveBeenCalledOnce()
    expect(sendRichMessagesMock).not.toHaveBeenCalled()
    expect(emitMock).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({
        eventType: "message:bot_received",
        hasResponse: true,
        messageId: baseProps.triggerMessageId,
        result: "success",
        routeType: "agent",
      }),
    )
  })

  test("valid JSON messages skipped with no actions → null returned for fallback", async () => {
    state.aiResponseText = JSON.stringify({
      messages: [
        {
          message: {
            text: "This message cannot be converted for the channel.",
          },
        },
      ],
      actions: [],
    })
    sendRichMessagesMock.mockResolvedValueOnce({ enqueued: 0, skipped: 1 })
    executeRichActionsMock.mockResolvedValueOnce({ executed: 0, failed: [] })

    const result = await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent({ isRichResponse: true }),
    })

    expect(result).toBeNull()
    expect(sendRichMessagesMock).toHaveBeenCalledOnce()
    expect(executeRichActionsMock).toHaveBeenCalledOnce()
    expect(appendHistoryMock).not.toHaveBeenCalled()
  })

  test("actions-only response with no executed actions → null returned for fallback", async () => {
    state.aiResponseText = JSON.stringify({
      actions: [{ action: "send_flow", flow_id: "missing-flow" }],
    })
    executeRichActionsMock.mockResolvedValueOnce({
      executed: 0,
      failed: [{ action: "send_flow", reason: "Flow not found" }],
    })

    const result = await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent({ isRichResponse: true }),
    })

    expect(result).toBeNull()
    expect(sendRichMessagesMock).not.toHaveBeenCalled()
    expect(appendHistoryMock).not.toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: baseProps.triggerMessageId,
      }),
      "[rich-response] action-only response failed without sending messages",
    )
  })

  test("empty plain_text response → no message sent, null returned", async () => {
    state.aiResponseText = "   " // whitespace only, not a valid JSON

    const result = await replyByAI({
      ...baseProps,
      aiAgent: makeAIAgent({ isRichResponse: true }),
    })

    // whitespace-only text: parseRichResponse returns plain_text but text.trim() is empty
    // → no sendMessageAndWait, falls through to null
    expect(sendMessageAndWaitMock).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })
})
