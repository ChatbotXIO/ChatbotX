import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirstGemini: vi.fn(),
  findFirstOpenai: vi.fn(),
  geminiEmbedding: vi.fn(),
  openaiEmbedding: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationGeminiModel: { findFirst: mocks.findFirstGemini },
      integrationOpenaiModel: { findFirst: mocks.findFirstOpenai },
    },
  },
}))

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => ({ embedding: mocks.geminiEmbedding }),
}))

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({ embedding: mocks.openaiEmbedding }),
}))

const { resolveEmbeddingModel } = await import("../src/server/embedding-model")

describe("resolveEmbeddingModel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFirstOpenai.mockResolvedValue(undefined)
    mocks.findFirstGemini.mockResolvedValue({
      auth: { authType: "secretText", secretText: "gemini-key" },
    })
    mocks.geminiEmbedding.mockReturnValue("gemini-embedding-model")
  })

  test("resolves Gemini when it is the only configured provider", async () => {
    await expect(resolveEmbeddingModel("workspace-1")).resolves.toEqual({
      model: "gemini-embedding-model",
      provider: "gemini",
    })

    expect(mocks.geminiEmbedding).toHaveBeenCalledWith("gemini-embedding-001")
    expect(mocks.openaiEmbedding).not.toHaveBeenCalled()
  })
})
