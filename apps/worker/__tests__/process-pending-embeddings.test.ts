import { APICallError } from "ai"
import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { processPendingEmbedding } from "../src/ai-agent/handlers/process-pending-embeddings"

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  findOrFail: vi.fn(),
  isInvalidApiKeyError: vi.fn(),
  loggerError: vi.fn(),
  logProviderError: vi.fn(),
  resolveEmbeddingModel: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@chatbotx.io/ai", () => ({
  isInvalidApiKeyError: mocks.isInvalidApiKeyError,
}))

vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: mocks.logProviderError,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: mocks.update },
  eq: vi.fn(),
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  aiEmbeddingStatuses: { enum: { success: "success" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiEmbeddingModel: {},
}))

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  embed: mocks.embed,
}))

vi.mock("../src/ai-agent/lib/embedding-model", () => ({
  resolveEmbeddingModel: mocks.resolveEmbeddingModel,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}))

describe("processPendingEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findOrFail.mockResolvedValue({
      content: "knowledge chunk",
      id: "embedding-1",
      status: "pending",
      workspaceId: "workspace-1",
    })
    mocks.isInvalidApiKeyError.mockReturnValue(false)
  })

  test("keeps the embedding pending and rejects when its provider is unavailable", async () => {
    const providerError = new Error("embedding provider unavailable")
    mocks.resolveEmbeddingModel.mockRejectedValue(providerError)

    await expect(
      processPendingEmbedding({ aiEmbeddingId: "embedding-1" }),
    ).rejects.toThrow(providerError)

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      providerError,
      "processPendingEmbedding item failed for embeddingId: embedding-1",
    )
  })

  test("does nothing for a duplicate job whose chunk is already embedded", async () => {
    mocks.findOrFail.mockResolvedValue({
      content: "knowledge chunk",
      id: "embedding-1",
      status: "success",
      workspaceId: "workspace-1",
    })

    await expect(
      processPendingEmbedding({ aiEmbeddingId: "embedding-1" }),
    ).resolves.toBeUndefined()

    expect(mocks.resolveEmbeddingModel).not.toHaveBeenCalled()
    expect(mocks.embed).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("fails without retrying and records an Error Log when the key is rejected", async () => {
    const keyError = new APICallError({
      message: "Incorrect API key provided",
      url: "https://api.openai.com/v1/embeddings",
      requestBodyValues: {},
      statusCode: 401,
    })
    mocks.resolveEmbeddingModel.mockResolvedValue({
      model: {},
      modelId: "text-embedding-ada-002",
      provider: "openai",
    })
    mocks.embed.mockRejectedValue(keyError)
    mocks.isInvalidApiKeyError.mockReturnValue(true)

    const rejection = processPendingEmbedding({ aiEmbeddingId: "embedding-1" })

    await expect(rejection).rejects.toBeInstanceOf(UnrecoverableError)
    await expect(rejection).rejects.toThrow(
      "Embedding provider rejected the API key: Incorrect API key provided",
    )
    expect(mocks.logProviderError).toHaveBeenCalledWith({
      provider: "openai",
      workspaceId: "workspace-1",
      error: keyError,
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test("rethrows a retryable provider error without an Error Log", async () => {
    const rateLimited = new Error("rate limited")
    mocks.resolveEmbeddingModel.mockResolvedValue({
      model: {},
      modelId: "text-embedding-ada-002",
      provider: "openai",
    })
    mocks.embed.mockRejectedValue(rateLimited)

    await expect(
      processPendingEmbedding({ aiEmbeddingId: "embedding-1" }),
    ).rejects.toBe(rateLimited)

    expect(mocks.logProviderError).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalled()
  })
})
