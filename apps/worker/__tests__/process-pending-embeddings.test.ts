import { beforeEach, describe, expect, test, vi } from "vitest"
import { processPendingEmbedding } from "../src/ai-agent/handlers/process-pending-embeddings"

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  findOrFail: vi.fn(),
  loggerError: vi.fn(),
  resolveEmbeddingModel: vi.fn(),
  update: vi.fn(),
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

vi.mock("ai", () => ({ embed: mocks.embed }))

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
})
