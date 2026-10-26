import type { Job } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { markEmbeddingChunkFailed } from "../src/ai-agent/lib/mark-embedding-chunk-failed"

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  markEmbeddingFailed: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  aiFileService: { markEmbeddingFailed: mocks.markEmbeddingFailed },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: {
    processPendingEmbedding: "processPendingEmbedding",
    summarizeConversation: "summarizeConversation",
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}))

const embeddingJobData = {
  type: "processPendingEmbedding",
  data: { aiEmbeddingId: "embedding-1" },
} as never

const jobAfterAttempts = (attemptsMade: number) =>
  ({ attemptsMade, opts: { attempts: 2 } }) as unknown as Job

describe("markEmbeddingChunkFailed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.markEmbeddingFailed.mockResolvedValue(true)
  })

  test("marks the chunk failed once the job has used its last attempt", async () => {
    await markEmbeddingChunkFailed({
      job: jobAfterAttempts(2),
      jobData: embeddingJobData,
      workspaceId: "workspace-1",
    })

    expect(mocks.markEmbeddingFailed).toHaveBeenCalledWith({
      embeddingId: "embedding-1",
      workspaceId: "workspace-1",
    })
  })

  test("leaves the chunk pending while BullMQ will still retry", async () => {
    await markEmbeddingChunkFailed({
      job: jobAfterAttempts(1),
      jobData: embeddingJobData,
      workspaceId: "workspace-1",
    })

    expect(mocks.markEmbeddingFailed).not.toHaveBeenCalled()
  })

  test("ignores jobs that are not chunk embeddings", async () => {
    await markEmbeddingChunkFailed({
      job: jobAfterAttempts(2),
      jobData: { type: "summarizeConversation", data: {} } as never,
      workspaceId: "workspace-1",
    })

    expect(mocks.markEmbeddingFailed).not.toHaveBeenCalled()
  })

  test("logs instead of writing when the workspace cannot be resolved", async () => {
    await markEmbeddingChunkFailed({
      job: jobAfterAttempts(2),
      jobData: embeddingJobData,
      workspaceId: undefined,
    })

    expect(mocks.markEmbeddingFailed).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { embeddingId: "embedding-1" },
      "Cannot mark AI embedding failed without a workspace",
    )
  })

  test("only logs when recording the failure throws", async () => {
    mocks.markEmbeddingFailed.mockRejectedValue(new Error("db down"))

    await expect(
      markEmbeddingChunkFailed({
        job: jobAfterAttempts(2),
        jobData: embeddingJobData,
        workspaceId: "workspace-1",
      }),
    ).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingId: "embedding-1",
        workspaceId: "workspace-1",
      }),
      "Failed to mark AI embedding failed",
    )
  })
})
