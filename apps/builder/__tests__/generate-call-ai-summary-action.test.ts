// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: { whatsappCallId: string; provider: string }
}) => Promise<unknown>

const mocks = vi.hoisted(() => ({
  getTranscriptTextForCall: vi.fn(),
  attachSummary: vi.fn(),
  generateCallSummary: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/ai", async () => {
  const { z } = await import("zod")
  return {
    aiProviders: z.enum([
      "openai",
      "gemini",
      "claude",
      "deepseek",
      "openrouter",
    ]),
  }
})

vi.mock("@chatbotx.io/ai/server", () => ({
  generateCallSummary: mocks.generateCallSummary,
}))

vi.mock("@chatbotx.io/business", () => ({
  whatsappCallTranscriptService: {
    getTranscriptTextForCall: mocks.getTranscriptTextForCall,
  },
  whatsappCallSummaryService: { attachSummary: mocks.attachSummary },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

const { generateCallAiSummaryAction } = await import(
  "../src/features/messages/actions/generate-call-ai-summary.action"
)
const getAction = generateCallAiSummaryAction as unknown as ActionHandler

describe("generateCallAiSummaryAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("generates via the chosen provider and persists the result", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValue(
      "Hello there, how are you?",
    )
    const aiSummary = { summary: "Friendly greeting exchange." }
    mocks.generateCallSummary.mockResolvedValue(aiSummary)
    mocks.attachSummary.mockResolvedValue(undefined)

    const result = await getAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { whatsappCallId: "call-1", provider: "openai" },
    })

    expect(mocks.generateCallSummary).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "openai",
      transcriptText: "Hello there, how are you?",
    })
    expect(mocks.attachSummary).toHaveBeenCalledWith({
      callId: "call-1",
      workspaceId: "ws-1",
      aiSummary,
      provider: "openai",
    })
    expect(result).toEqual({ aiSummary })
  })

  test("throws before calling the provider when the transcript is empty", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValue("   ")

    await expect(
      getAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { whatsappCallId: "call-1", provider: "openai" },
      }),
    ).rejects.toThrow("This call has no transcript to summarize")

    expect(mocks.generateCallSummary).not.toHaveBeenCalled()
    expect(mocks.attachSummary).not.toHaveBeenCalled()
  })

  test("propagates a provider failure without persisting anything", async () => {
    mocks.getTranscriptTextForCall.mockResolvedValue("Some transcript text")
    mocks.generateCallSummary.mockRejectedValue(new Error("provider down"))

    await expect(
      getAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { whatsappCallId: "call-1", provider: "claude" },
      }),
    ).rejects.toThrow("provider down")

    expect(mocks.attachSummary).not.toHaveBeenCalled()
  })
})
