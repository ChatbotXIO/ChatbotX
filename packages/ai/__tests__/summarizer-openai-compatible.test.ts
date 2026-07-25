import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createAIModelInstance: vi.fn(),
  getOpenaiCompatibleIntegrationInDB: vi.fn(),
  createOpenaiCompatibleModelInstance: vi.fn(),
  generateText: vi.fn(),
  getCachedAIIntegration: vi.fn(),
  getOpenaiCompatibleAutoReplyIntegrationInDB: vi.fn(),
}))

vi.mock("ai", () => ({
  generateText: mocks.generateText,
}))

vi.mock("../src/server/cache", () => ({
  getCachedAIIntegration: mocks.getCachedAIIntegration,
}))

vi.mock("../src/server/factory", () => ({
  createAIModelInstance: mocks.createAIModelInstance,
  getOpenaiCompatibleAutoReplyIntegrationInDB:
    mocks.getOpenaiCompatibleAutoReplyIntegrationInDB,
  getOpenaiCompatibleIntegrationInDB: mocks.getOpenaiCompatibleIntegrationInDB,
}))

vi.mock("../src/server/openai-compatible", () => ({
  createOpenaiCompatibleModelInstance:
    mocks.createOpenaiCompatibleModelInstance,
}))

const { summarizeConversation } = await import(
  "../src/server/services/summarizer"
)

describe("summarizeConversation OpenAI Compatible fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("uses an active OpenAI Compatible auto-reply integration when no legacy provider is active", async () => {
    const integration = {
      id: "integration-openai-compatible-1",
      autoReply: true,
      baseURL: "https://integrate.api.nvidia.com/v1",
      defaultModel: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      enabled: true,
      preset: "nim",
      workspaceId: "workspace-1",
    }

    mocks.getCachedAIIntegration.mockResolvedValue(null)
    mocks.getOpenaiCompatibleAutoReplyIntegrationInDB.mockResolvedValue(
      integration,
    )
    mocks.createOpenaiCompatibleModelInstance.mockReturnValue("nim-model")
    mocks.generateText.mockResolvedValue({ text: " Conversation summary " })

    const result = await summarizeConversation({
      workspaceId: "workspace-1",
      messages: [{ role: "user", content: "Hello" }],
    })

    expect(result).toBe("Conversation summary")
    expect(mocks.createAIModelInstance).not.toHaveBeenCalled()
    expect(mocks.createOpenaiCompatibleModelInstance).toHaveBeenCalledWith({
      integration,
      modelId: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    })
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "nim-model" }),
    )
  })

  test("prefers the AI Agent OpenAI Compatible model over the integration default model", async () => {
    const integration = {
      id: "integration-openai-compatible-1",
      autoReply: true,
      baseURL: "https://integrate.api.nvidia.com/v1",
      defaultModel: "meta/llama-3.3-70b-instruct",
      enabled: true,
      preset: "nim",
      workspaceId: "workspace-1",
    }

    mocks.getCachedAIIntegration.mockResolvedValue(null)
    mocks.getOpenaiCompatibleIntegrationInDB.mockResolvedValue(integration)
    mocks.createOpenaiCompatibleModelInstance.mockReturnValue("agent-nim-model")
    mocks.generateText.mockResolvedValue({ text: " Agent summary " })

    const result = await summarizeConversation({
      workspaceId: "workspace-1",
      messages: [{ role: "user", content: "Hello" }],
      preferredModels: [
        {
          kind: "openaiCompatible",
          integrationId: "integration-openai-compatible-1",
          model: "deepseek-ai/deepseek-v4-pro",
        },
      ],
    })

    expect(result).toBe("Agent summary")
    expect(mocks.createAIModelInstance).not.toHaveBeenCalled()
    expect(
      mocks.getOpenaiCompatibleAutoReplyIntegrationInDB,
    ).not.toHaveBeenCalled()
    expect(mocks.createOpenaiCompatibleModelInstance).toHaveBeenCalledWith({
      integration,
      modelId: "deepseek-ai/deepseek-v4-pro",
    })
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "agent-nim-model" }),
    )
  })
})
