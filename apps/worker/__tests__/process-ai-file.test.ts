import { beforeEach, describe, expect, test, vi } from "vitest"
import { processAIFile } from "../src/heavy/handlers/process-ai-file"

const mocks = vi.hoisted(() => ({
  addBulk: vi.fn(),
  extractTextFromFile: vi.fn(),
  findFileOrFail: vi.fn(),
  reconcilePendingChunks: vi.fn(),
  resolveEmbeddingModel: vi.fn(),
  runExclusive: vi.fn(
    async <T>({ fn }: { fn: () => Promise<T> }) => await fn(),
  ),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createAiFileEmbeddingRepository: () => ({
    findFileOrFail: mocks.findFileOrFail,
    reconcilePendingChunks: mocks.reconcilePendingChunks,
  }),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: { processPendingEmbedding: "processPendingEmbedding" },
  aiAgentQueue: { addBulk: mocks.addBulk },
}))

vi.mock("../src/env", () => ({
  env: {
    HEAVY_MAX_CHUNKS_PER_FILE: 10,
    HEAVY_MAX_EXTRACTED_TEXT_CHARS: 5_000_000,
    HEAVY_MAX_FILE_BYTES: 50 * 1024 * 1024,
  },
}))

vi.mock("../src/ai-agent/lib/embedding-model", () => ({
  resolveEmbeddingModel: mocks.resolveEmbeddingModel,
}))

vi.mock("../src/ai-agent/lib/text-extractor", () => ({
  extractTextFromFile: mocks.extractTextFromFile,
}))

const aiFile = {
  id: "ai-file-1",
  workspaceId: "workspace-1",
  path: "knowledge/file.pdf",
  mimeType: "application/pdf",
  size: 1024,
}

const embeddingJobIdRegex = /^ai-file-embedding-ai-file-1-\d+$/

describe("processAIFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFileOrFail.mockResolvedValue(aiFile)
    mocks.resolveEmbeddingModel.mockResolvedValue({})
    mocks.extractTextFromFile.mockResolvedValue("alpha beta gamma delta")
  })

  test("locks, reconciles chunks, and enqueues deterministic pending jobs", async () => {
    mocks.reconcilePendingChunks.mockResolvedValue([{ id: "123" }])

    await processAIFile({ aiFileId: "ai-file-1" }, 10, 0)

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ai-file:process:ai-file-1" }),
    )
    expect(mocks.reconcilePendingChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        aiFileId: "ai-file-1",
        chunks: expect.arrayContaining([
          expect.objectContaining({ content: "alpha beta" }),
        ]),
        workspaceId: "workspace-1",
      }),
    )
    expect(mocks.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "processPendingEmbedding",
        opts: expect.objectContaining({
          jobId: expect.stringMatching(embeddingJobIdRegex),
        }),
      }),
    ])
  })

  test("does not re-enqueue chunks that reconciled as already successful", async () => {
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.reconcilePendingChunks).toHaveBeenCalled()
    expect(mocks.addBulk).not.toHaveBeenCalled()
  })

  test("reconciles empty files without enqueuing embeddings", async () => {
    mocks.extractTextFromFile.mockResolvedValue("")
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.reconcilePendingChunks).toHaveBeenCalledWith(
      expect.objectContaining({ chunks: [] }),
    )
    expect(mocks.addBulk).not.toHaveBeenCalled()
  })
})
