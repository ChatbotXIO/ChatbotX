import type {
  AIAgentModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { type ModelMessage, streamText } from "ai"
import { beforeEach, describe, expect, test, vi } from "vitest"

const state = {
  aiResponseText: "Hello from AI",
}

const appendHistoryMock = vi.hoisted(() => vi.fn(async () => undefined))
const getAllVariablesMock = vi.hoisted(() => vi.fn(async () => []))
const createAIModelInstanceMock = vi.hoisted(() =>
  vi.fn(() => ({ type: "native-model" })),
)
const createOpenaiCompatibleModelInstanceMock = vi.hoisted(() =>
  vi.fn(() => ({ type: "openai-compatible-model" })),
)
const findAIIntegrationMock = vi.hoisted(() =>
  vi.fn(async () => ({ id: "native-integration" })),
)
const findOpenaiCompatibleMock = vi.hoisted(() => vi.fn())
const workerLoggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiTimeouts: {
    aiTotal: 30_000,
    aiStep: 10_000,
    aiFirstChunk: 5000,
    aiChunk: 5000,
  },
  helpTexts: {
    fallbackLookup: "I found something, but cannot summarize it yet.",
    fileSearchDescription: "Search files",
    fileSearchQueryDescription: "Query",
    fileSearchNoResult: "No result",
    fileSearchFoundPrefix: "Found",
  },
  processStreamingText: vi.fn(async () => ({ fullText: state.aiResponseText })),
  toolPrefixes: { enum: { file: "file", fn: "fn", mcp: "mcp", sys: "sys" } },
  toStepSeparatedTextStream: vi.fn((stream: unknown) => stream),
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  aiContextService: { appendHistory: appendHistoryMock },
  aiIntegrationService: { findBy: findAIIntegrationMock },
  appendFabricationGuard: (prompt: string) => prompt,
  appendKnowledgeBaseGuard: (prompt: string) => prompt,
  appendToolOutputGuard: (prompt: string) => prompt,
  createAIModelInstance: createAIModelInstanceMock,
  createOpenaiCompatibleModelInstance: createOpenaiCompatibleModelInstanceMock,
  getAIToolset: vi.fn(async () => ({ tools: {}, cleanup: vi.fn() })),
  McpClient: vi.fn(),
  normalizeMcpContent: vi.fn((content: unknown) => content),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationOpenaiCompatibleService: {
    findByWorkspaceIdAndId: findOpenaiCompatibleMock,
  },
}))

vi.mock("../src/lib/logger", () => ({ logger: workerLoggerMock }))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: getAllVariablesMock,
    replaceAll: vi.fn(async ({ text }: { text: string }) => text),
  },
}))

vi.mock("ai", () => ({
  streamText: vi.fn(async () => ({ textStream: [] })),
  isStepCount: vi.fn(() => () => false),
}))

const { runAIAgentRunner } = await import(
  "../src/integration/handlers/shared/ai-agent-runner"
)

function makeAIAgent(overrides?: Partial<AIAgentModel>): AIAgentModel {
  return {
    id: "agent-1",
    workspaceId: "ws-1",
    name: "Test Agent",
    prompt: "You are helpful.",
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
    ...overrides,
  } as AIAgentModel
}

function makeConversation(): ConversationModel {
  return {
    id: "conv-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
    channel: "webchat",
    status: "open",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ConversationModel
}

describe("AI agent runner OpenAI-compatible providers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.aiResponseText = "Hello from AI"
    findOpenaiCompatibleMock.mockResolvedValue({
      id: "dynamic-1",
      autoReply: false,
      enabled: true,
      baseURL: "http://localhost:1234/v1",
      preset: "lmstudio",
      name: "Local",
    })
  })

  test("runs a configured OpenAI-compatible provider row", async () => {
    const result = await runAIAgentRunner({
      aiAgent: makeAIAgent({
        models: [
          {
            kind: "openaiCompatible",
            integrationId: "dynamic-1",
            model: "local-model",
          },
        ] as AIAgentModel["models"],
      }),
      conversation: makeConversation(),
      messages: [] as ModelMessage[],
    })

    expect(result?.provider).toBe("openaiCompatible")
    expect(findOpenaiCompatibleMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "dynamic-1",
    })
    expect(createOpenaiCompatibleModelInstanceMock).toHaveBeenCalledWith({
      integration: expect.objectContaining({ id: "dynamic-1" }),
      modelId: "local-model",
    })
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { type: "openai-compatible-model" },
      }),
    )
  })

  test("builds the prompt's variable context with the inbox sender of the running flow", async () => {
    await runAIAgentRunner({
      aiAgent: makeAIAgent({
        models: [
          {
            kind: "openaiCompatible",
            integrationId: "dynamic-1",
            model: "local-model",
          },
        ] as AIAgentModel["models"],
      }),
      conversation: makeConversation(),
      messages: [] as ModelMessage[],
      sentByUserId: "user-1",
    })

    expect(getAllVariablesMock).toHaveBeenCalledWith(
      expect.objectContaining({ sentByUserId: "user-1" }),
    )
  })

  test("runs a custom OpenAI-compatible provider row", async () => {
    findOpenaiCompatibleMock.mockResolvedValueOnce({
      id: "custom-1",
      autoReply: false,
      enabled: true,
      baseURL: "https://llm.wokushop.com/v1",
      preset: "custom",
      name: "Custom",
    })

    const result = await runAIAgentRunner({
      aiAgent: makeAIAgent({
        models: [
          {
            kind: "openaiCompatible",
            integrationId: "custom-1",
            model: "gpt-4o-mini",
          },
        ] as AIAgentModel["models"],
      }),
      conversation: makeConversation(),
      messages: [] as ModelMessage[],
    })

    expect(result?.provider).toBe("openaiCompatible")
    expect(createOpenaiCompatibleModelInstanceMock).toHaveBeenCalledWith({
      integration: expect.objectContaining({
        id: "custom-1",
        baseURL: "https://llm.wokushop.com/v1",
        preset: "custom",
      }),
      modelId: "gpt-4o-mini",
    })
  })

  test("runs a preferred OpenAI-compatible model without native provider filtering", async () => {
    const result = await runAIAgentRunner({
      aiAgent: makeAIAgent({
        models: [{ provider: "openai", model: "gpt-5.4-mini" }],
      }),
      conversation: makeConversation(),
      messages: [] as ModelMessage[],
      preferredModel: {
        kind: "openaiCompatible",
        integrationId: "dynamic-1",
        model: "local-model",
      },
    })

    expect(result?.provider).toBe("openaiCompatible")
    expect(findOpenaiCompatibleMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "dynamic-1",
    })
    expect(createAIModelInstanceMock).not.toHaveBeenCalled()
    expect(createOpenaiCompatibleModelInstanceMock).toHaveBeenCalledWith({
      integration: expect.objectContaining({ id: "dynamic-1" }),
      modelId: "local-model",
    })
  })

  test("skips disabled dynamic providers and continues native fallback", async () => {
    findOpenaiCompatibleMock.mockResolvedValueOnce({
      id: "dynamic-1",
      enabled: false,
    })

    const result = await runAIAgentRunner({
      aiAgent: makeAIAgent({
        models: [
          {
            kind: "openaiCompatible",
            integrationId: "dynamic-1",
            model: "local-model",
          },
          { provider: "openai", model: "gpt-5.4-mini" },
        ] as AIAgentModel["models"],
      }),
      conversation: makeConversation(),
      messages: [] as ModelMessage[],
    })

    expect(result?.provider).toBe("openai")
    expect(createOpenaiCompatibleModelInstanceMock).not.toHaveBeenCalled()
    expect(createAIModelInstanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        modelId: "gpt-5.4-mini",
      }),
    )
  })

  test("logs only a v7 tool-error callback with its execution time", async () => {
    vi.mocked(streamText).mockImplementationOnce((options) => {
      options.onToolExecutionEnd?.({
        toolCall: { toolCallId: "call-1", toolName: "failing_tool" },
        toolExecutionMs: 42,
        toolOutput: {
          error: new Error("expected tool failure"),
          toolCallId: "call-1",
          toolName: "failing_tool",
          type: "tool-error",
        },
      })
      return { textStream: [] }
    })

    await runAIAgentRunner({
      aiAgent: makeAIAgent(),
      conversation: makeConversation(),
      messages: [] as ModelMessage[],
    })

    expect(workerLoggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMs: 42,
        errorMessage: "expected tool failure",
        toolCallId: "call-1",
        toolName: "failing_tool",
      }),
      "[ai-agent-runner] tool execution failed",
    )
  })

  test("counts a v7 tool-error step part exactly once in toolStats", async () => {
    vi.mocked(streamText).mockImplementationOnce((options) => {
      options.onToolExecutionEnd?.({
        toolCall: { toolCallId: "call-1", toolName: "failing_tool" },
        toolExecutionMs: 42,
        toolOutput: {
          error: new Error("expected tool failure"),
          toolCallId: "call-1",
          toolName: "failing_tool",
          type: "tool-error",
        },
      } as never)
      options.onStepEnd?.({
        content: [{ type: "tool-call" }, { type: "tool-error" }],
        finishReason: "tool-calls",
        rawFinishReason: "tool_calls",
        stepNumber: 0,
        toolCalls: [{ toolCallId: "call-1", toolName: "failing_tool" }],
        toolResults: [],
      } as never)
      return { textStream: [] } as never
    })

    const result = await runAIAgentRunner({
      aiAgent: makeAIAgent(),
      conversation: makeConversation(),
      messages: [] as ModelMessage[],
    })

    expect(result?.toolStats).toMatchObject({
      steps: 1,
      toolCallsCount: 1,
      toolErrorsCount: 1,
      toolNames: ["failing_tool"],
    })
  })

  test("bounds the wait for the first chunk of each step", async () => {
    await runAIAgentRunner({
      aiAgent: makeAIAgent(),
      conversation: makeConversation(),
      messages: [] as ModelMessage[],
    })

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: expect.objectContaining({ firstChunkMs: 5000 }),
      }),
    )
  })
})
