import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `processAIFile` chunks an uploaded file and enqueues one embedding job per
// chunk. Before the worker data-access refactor it inserted the chunks and
// then re-read them with `db.query.aiEmbeddingModel.findMany({ aiFileId })`
// to collect the ids for the queue fan-out. That read-back is keyed on the
// FILE, not the insert, so a retry of the same file re-enqueued every
// embedding produced by every earlier run.
//
// `aiEmbeddingRepository.bulkCreatePending` now returns the ids inserted by
// THIS call via `.returning({ id })`, so the fan-out is exactly the new rows.
// This is a deliberate behavior change on the retry path; the tests below pin
// it so a future "restore parity" edit has to argue with a failing test.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  addBulk: vi.fn(),
  bulkCreatePending: vi.fn(),
  extractTextFromFile: vi.fn(),
  findOrFail: vi.fn(),
  resolveEmbeddingModel: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  aiEmbeddingRepository: { bulkCreatePending: mocks.bulkCreatePending },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiFileModel: { id: "aiFile.id" },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: {
    processFile: "processFile",
    processPendingEmbedding: "processPendingEmbedding",
  },
  aiAgentQueue: { addBulk: mocks.addBulk },
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

const AI_FILE = {
  id: "file-1",
  workspaceId: "ws-1",
  path: "/tmp/doc.txt",
  mimeType: "text/plain",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findOrFail.mockResolvedValue(AI_FILE)
  mocks.resolveEmbeddingModel.mockResolvedValue({})
  mocks.addBulk.mockResolvedValue(undefined)
})

describe("processAIFile", () => {
  test("enqueues exactly the ids bulkCreatePending returned — not a read-back by file", async () => {
    mocks.extractTextFromFile.mockResolvedValue("alpha beta")
    mocks.bulkCreatePending.mockResolvedValue([
      { id: "emb-new-1" },
      { id: "emb-new-2" },
    ])

    await processAIFile({ aiFileId: "file-1" } as never)

    expect(mocks.addBulk).toHaveBeenCalledTimes(1)
    const jobs = mocks.addBulk.mock.calls[0]?.[0] as Array<{
      name: string
      data: { data: { aiEmbeddingId: string } }
    }>
    expect(jobs.map((j) => j.data.data.aiEmbeddingId)).toEqual([
      "emb-new-1",
      "emb-new-2",
    ])
    expect(jobs.every((j) => j.name === "processPendingEmbedding")).toBe(true)
  })

  test("a retry that inserts nothing new enqueues nothing — prior runs' embeddings are not re-processed", async () => {
    mocks.extractTextFromFile.mockResolvedValue("alpha beta")
    // Every chunk lost to an earlier run → `.returning({ id })` is empty even
    // though the file already owns many rows in the table.
    mocks.bulkCreatePending.mockResolvedValue([])

    await processAIFile({ aiFileId: "file-1" } as never)

    expect(mocks.addBulk).toHaveBeenCalledWith([])
  })

  test("inserts the chunks with the file's own id and workspaceId", async () => {
    mocks.extractTextFromFile.mockResolvedValue("hello world")
    mocks.bulkCreatePending.mockResolvedValue([{ id: "emb-1" }])

    await processAIFile({ aiFileId: "file-1" } as never, 5, 0)

    expect(mocks.bulkCreatePending).toHaveBeenCalledWith({
      aiFileId: "file-1",
      workspaceId: "ws-1",
      chunks: [{ content: "hello" }, { content: "worl" }, { content: "d" }],
    })
  })

  test("validates the embedding provider before inserting any chunk", async () => {
    mocks.extractTextFromFile.mockResolvedValue("alpha")
    mocks.resolveEmbeddingModel.mockRejectedValue(
      new Error("No embedding provider configured"),
    )

    await expect(
      processAIFile({ aiFileId: "file-1" } as never),
    ).rejects.toThrow("No embedding provider configured")

    expect(mocks.bulkCreatePending).not.toHaveBeenCalled()
    expect(mocks.addBulk).not.toHaveBeenCalled()
  })
})
