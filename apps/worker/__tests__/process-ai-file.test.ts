import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  addBulk: vi.fn(),
  deleteWhere: vi.fn(),
  extractTextFromFile: vi.fn(),
  findOrFail: vi.fn(),
  insertValues: vi.fn(),
  resolveEmbeddingModel: vi.fn(),
  runExclusive: vi.fn(
    async <T>({ fn }: { fn: () => Promise<T> }) => await fn(),
  ),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    await fn({
      delete: vi.fn(() => ({ where: mocks.deleteWhere })),
      insert: vi.fn(() => ({ values: mocks.insertValues })),
    })
  }),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiEmbeddingModel: { aiFileId: "aiFileId" },
  aiFileModel: {},
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

const { processAIFile } = await import(
  "../src/ai-agent/handlers/process-ai-file"
)

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
    mocks.findOrFail.mockResolvedValue(aiFile)
    mocks.resolveEmbeddingModel.mockResolvedValue({})
    mocks.extractTextFromFile.mockResolvedValue("alpha beta gamma delta")
  })

  test("locks, replaces embeddings, and enqueues deterministic embedding jobs", async () => {
    await processAIFile({ aiFileId: "ai-file-1" }, 10, 0)
    const firstRows = mocks.insertValues.mock.calls[0]?.[0]
    const firstJobs = mocks.addBulk.mock.calls[0]?.[0]

    vi.clearAllMocks()
    mocks.findOrFail.mockResolvedValue(aiFile)
    mocks.resolveEmbeddingModel.mockResolvedValue({})
    mocks.extractTextFromFile.mockResolvedValue("alpha beta gamma delta")

    await processAIFile({ aiFileId: "ai-file-1" }, 10, 0)
    const secondRows = mocks.insertValues.mock.calls[0]?.[0]
    const secondJobs = mocks.addBulk.mock.calls[0]?.[0]

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ai-file:process:ai-file-1" }),
    )
    expect(mocks.deleteWhere).toHaveBeenCalled()
    expect(secondRows).toEqual(firstRows)
    expect(secondJobs).toEqual(firstJobs)
    expect(secondJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "processPendingEmbedding",
          opts: expect.objectContaining({
            jobId: expect.stringMatching(embeddingJobIdRegex),
          }),
        }),
      ]),
    )
  })

  test("deletes stale embeddings but does not enqueue empty files", async () => {
    mocks.extractTextFromFile.mockResolvedValue("")

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.deleteWhere).toHaveBeenCalled()
    expect(mocks.insertValues).not.toHaveBeenCalled()
    expect(mocks.addBulk).not.toHaveBeenCalled()
  })
})
