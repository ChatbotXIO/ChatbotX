import { createHash } from "node:crypto"
import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  FileFetchError,
  FileSizeLimitError,
} from "../src/ai-agent/lib/extraction-errors"
import { AIFileProcessingError } from "../src/heavy/handlers/ai-file-processing-error"
import { processAIFile } from "../src/heavy/handlers/process-ai-file"

const mocks = vi.hoisted(() => ({
  EmbeddingProviderNotConfiguredError: class EmbeddingProviderNotConfiguredError extends Error {},
  addBulk: vi.fn(),
  extractKnowledgeDocument: vi.fn(),
  findFileOrFail: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  markChunked: vi.fn(),
  markProcessingRunStarted: vi.fn(),
  markProcessingRunSucceeded: vi.fn(),
  reconcilePendingChunks: vi.fn(),
  refreshProcessingRunLease: vi.fn(),
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

vi.mock("@chatbotx.io/business", () => ({
  aiFileService: {
    markChunked: mocks.markChunked,
    markProcessingRunStarted: mocks.markProcessingRunStarted,
    markProcessingRunSucceeded: mocks.markProcessingRunSucceeded,
    refreshProcessingRunLease: mocks.refreshProcessingRunLease,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AI_FILE_EMBEDDING_PRIORITY: 5,
  AIJobAction: { processPendingEmbedding: "processPendingEmbedding" },
  aiAgentQueue: { addBulk: mocks.addBulk },
  buildAIFileEmbeddingJobId: ({
    aiFileId,
    embeddingId,
    runId,
  }: {
    aiFileId: string
    embeddingId: string
    runId?: string
  }) =>
    `ai-file-embedding-${aiFileId}-${embeddingId}${runId ? `-r${runId}` : ""}`,
}))

vi.mock("../src/env", () => ({
  env: {
    HEAVY_MAX_CHUNKS_PER_FILE: 10,
    HEAVY_MAX_EXTRACTED_TEXT_CHARS: 5_000_000,
    HEAVY_MAX_FILE_BYTES: 50 * 1024 * 1024,
  },
}))

vi.mock("../src/ai-agent/lib/embedding-model", () => ({
  EmbeddingProviderNotConfiguredError:
    mocks.EmbeddingProviderNotConfiguredError,
  resolveEmbeddingModel: mocks.resolveEmbeddingModel,
}))

vi.mock("../src/ai-agent/lib/text-extractor", () => ({
  extractKnowledgeDocument: mocks.extractKnowledgeDocument,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn },
}))

const aiFile = {
  id: "ai-file-1",
  workspaceId: "workspace-1",
  name: "file.pdf",
  path: "knowledge/file.pdf",
  mimeType: "application/pdf",
  size: 1024,
}

const embeddingJobIdRegex = /^ai-file-embedding-ai-file-1-\d+$/

// The pre-Phase-1 embedding id formula: prose chunk ids must not change, or
// every existing prose file would be re-embedded on its next processing.
function legacyEmbeddingId(chunkIndex: number, content: string): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ aiFileId: "ai-file-1", chunkIndex, content }))
    .digest("hex")
  const id = BigInt(`0x${digest.slice(0, 15)}`)
  return id === 0n ? "1" : id.toString()
}

function reconciledChunks(): {
  chunkIndex: number
  content: string
  id: string
}[] {
  return mocks.reconcilePendingChunks.mock.calls[0]?.[0].chunks ?? []
}

describe("processAIFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFileOrFail.mockResolvedValue(aiFile)
    mocks.resolveEmbeddingModel.mockResolvedValue({})
    mocks.extractKnowledgeDocument.mockResolvedValue({
      kind: "prose",
      text: "alpha beta gamma delta",
    })
    mocks.markProcessingRunStarted.mockResolvedValue(true)
    mocks.refreshProcessingRunLease.mockResolvedValue(true)
  })

  test("locks, reconciles chunks, and enqueues deterministic pending jobs", async () => {
    mocks.reconcilePendingChunks.mockResolvedValue([{ id: "123" }])
    mocks.findFileOrFail.mockResolvedValue({
      ...aiFile,
      chunkingConfig: { chunkSize: 200, overlapSize: 0 },
    })
    mocks.extractKnowledgeDocument.mockResolvedValue({
      kind: "prose",
      text: Array.from({ length: 60 }, () => "alpha").join(" "),
    })

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ai-file:process:ai-file-1" }),
    )
    expect(mocks.reconcilePendingChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        aiFileId: "ai-file-1",
        workspaceId: "workspace-1",
      }),
    )
    // The stored chunkSize is honored and positions are 0..n-1.
    const chunks = mocks.reconcilePendingChunks.mock.calls[0]?.[0].chunks
    expect(chunks.length).toBeGreaterThan(1)
    expect(
      chunks.every((chunk: { content: string }) => chunk.content.length <= 200),
    ).toBe(true)
    expect(
      chunks.map((chunk: { chunkIndex: number }) => chunk.chunkIndex),
    ).toEqual(chunks.map((_: unknown, index: number) => index))
    expect(mocks.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "processPendingEmbedding",
        opts: expect.objectContaining({
          jobId: expect.stringMatching(embeddingJobIdRegex),
          // Below live conversation jobs, which carry no priority.
          priority: 5,
        }),
      }),
    ])
  })

  test("does not re-enqueue chunks that reconciled as already successful", async () => {
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.reconcilePendingChunks).toHaveBeenCalled()
    expect(mocks.markChunked).toHaveBeenCalledWith(
      expect.objectContaining({
        chunking: expect.objectContaining({ strategy: "prose", chunkCount: 1 }),
      }),
    )
    expect(mocks.addBulk).not.toHaveBeenCalled()
  })

  test("fences reindex side effects with the processing run lease", async () => {
    mocks.reconcilePendingChunks.mockResolvedValue([{ id: "123" }])

    await processAIFile({ aiFileId: "ai-file-1", runId: "run-1" })

    expect(mocks.markProcessingRunStarted).toHaveBeenCalledWith({
      aiFileId: "ai-file-1",
      workspaceId: "workspace-1",
      runId: "run-1",
    })
    expect(mocks.refreshProcessingRunLease).toHaveBeenCalledTimes(2)
    expect(mocks.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        opts: expect.objectContaining({
          jobId: "ai-file-embedding-ai-file-1-123-rrun-1",
        }),
      }),
    ])
    expect(mocks.markProcessingRunSucceeded).toHaveBeenCalledWith({
      aiFileId: "ai-file-1",
      workspaceId: "workspace-1",
      runId: "run-1",
    })
  })

  test("skips processing when a run has been superseded", async () => {
    mocks.markProcessingRunStarted.mockResolvedValue(false)

    await processAIFile({ aiFileId: "ai-file-1", runId: "run-1" })

    expect(mocks.extractKnowledgeDocument).not.toHaveBeenCalled()
    expect(mocks.reconcilePendingChunks).not.toHaveBeenCalled()
    expect(mocks.addBulk).not.toHaveBeenCalled()
  })

  test("does not reconcile or enqueue after a lease is lost", async () => {
    mocks.refreshProcessingRunLease.mockResolvedValue(false)

    await processAIFile({ aiFileId: "ai-file-1", runId: "run-1" })

    expect(mocks.reconcilePendingChunks).not.toHaveBeenCalled()
    expect(mocks.addBulk).not.toHaveBeenCalled()
    expect(mocks.markProcessingRunSucceeded).not.toHaveBeenCalled()
  })

  test("leaves a legacy job without a run id untouched by run tracking", async () => {
    mocks.reconcilePendingChunks.mockResolvedValue([{ id: "123" }])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.markProcessingRunStarted).not.toHaveBeenCalled()
    expect(mocks.refreshProcessingRunLease).not.toHaveBeenCalled()
    expect(mocks.markProcessingRunSucceeded).not.toHaveBeenCalled()
    expect(mocks.addBulk.mock.calls[0]?.[0][0].opts.jobId).toBe(
      "ai-file-embedding-ai-file-1-123",
    )
  })

  test("orders run tracking around every side effect", async () => {
    mocks.reconcilePendingChunks.mockResolvedValue([{ id: "123" }])

    await processAIFile({ aiFileId: "ai-file-1", runId: "run-1" })

    const order = (mock: { mock: { invocationCallOrder: number[] } }) =>
      mock.mock.invocationCallOrder
    const [firstLease, secondLease] = order(mocks.refreshProcessingRunLease)
    expect(order(mocks.markProcessingRunStarted)[0]).toBeLessThan(
      order(mocks.extractKnowledgeDocument)[0] as number,
    )
    expect(order(mocks.extractKnowledgeDocument)[0]).toBeLessThan(
      firstLease as number,
    )
    expect(firstLease).toBeLessThan(
      order(mocks.reconcilePendingChunks)[0] as number,
    )
    expect(order(mocks.reconcilePendingChunks)[0]).toBeLessThan(
      order(mocks.markChunked)[0] as number,
    )
    expect(order(mocks.markChunked)[0]).toBeLessThan(secondLease as number)
    expect(secondLease).toBeLessThan(order(mocks.addBulk)[0] as number)
    expect(order(mocks.addBulk)[0]).toBeLessThan(
      order(mocks.markProcessingRunSucceeded)[0] as number,
    )
  })

  test("reconciles but never enqueues when the lease is lost before enqueue", async () => {
    mocks.reconcilePendingChunks.mockResolvedValue([{ id: "123" }])
    mocks.refreshProcessingRunLease
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await processAIFile({ aiFileId: "ai-file-1", runId: "run-1" })

    expect(mocks.reconcilePendingChunks).toHaveBeenCalled()
    expect(mocks.addBulk).not.toHaveBeenCalled()
    expect(mocks.markProcessingRunSucceeded).not.toHaveBeenCalled()
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "beforeEnqueue", runId: "run-1" }),
      "AI file processing run superseded, skipping",
    )
  })

  test("records success with a single lease when nothing is pending", async () => {
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1", runId: "run-1" })

    expect(mocks.refreshProcessingRunLease).toHaveBeenCalledTimes(1)
    expect(mocks.markProcessingRunSucceeded).toHaveBeenCalled()
  })

  test("a lost first lease writes no chunks and no chunking metadata", async () => {
    mocks.refreshProcessingRunLease.mockResolvedValue(false)

    await processAIFile({ aiFileId: "ai-file-1", runId: "run-1" })

    expect(mocks.markChunked).not.toHaveBeenCalled()
  })

  test.each([
    [
      "fileTooLarge",
      () =>
        mocks.findFileOrFail.mockResolvedValue({
          ...aiFile,
          size: 60 * 1024 * 1024,
        }),
    ],
    [
      "tooManyChunks",
      () => {
        mocks.findFileOrFail.mockResolvedValue({
          ...aiFile,
          chunkingConfig: { chunkSize: 200, overlapSize: 0 },
        })
        mocks.extractKnowledgeDocument.mockResolvedValue({
          kind: "prose",
          text: Array.from({ length: 1000 }, (_, i) => `word${i}`).join(" "),
        })
      },
    ],
    [
      "fileUnreadable",
      () =>
        mocks.extractKnowledgeDocument.mockRejectedValue(new Error("bad zip")),
    ],
    [
      "fileTooLarge",
      () =>
        mocks.extractKnowledgeDocument.mockRejectedValue(
          new FileSizeLimitError("File exceeds 52428800 byte limit"),
        ),
    ],
    [
      "noEmbeddingProvider",
      () =>
        mocks.resolveEmbeddingModel.mockRejectedValue(
          new mocks.EmbeddingProviderNotConfiguredError("missing"),
        ),
    ],
  ] as const)("throws AIFileProcessingError(%s)", async (code, arrange) => {
    arrange()

    const error = await processAIFile({
      aiFileId: "ai-file-1",
      runId: "run-1",
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AIFileProcessingError)
    expect((error as AIFileProcessingError).code).toBe(code)
    expect(mocks.reconcilePendingChunks).not.toHaveBeenCalled()
  })

  test("fails permanent errors as unrecoverable so BullMQ does not retry them", async () => {
    mocks.resolveEmbeddingModel.mockRejectedValue(
      new mocks.EmbeddingProviderNotConfiguredError("missing"),
    )

    const error = await processAIFile({
      aiFileId: "ai-file-1",
      runId: "run-1",
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(UnrecoverableError)
  })

  test("does not relabel an infrastructure error from the embedding resolver", async () => {
    const failure = new Error("connection terminated")
    mocks.resolveEmbeddingModel.mockRejectedValue(failure)

    const error = await processAIFile({
      aiFileId: "ai-file-1",
      runId: "run-1",
    }).catch((caught: unknown) => caught)

    expect(error).toBe(failure)
    expect(error).not.toBeInstanceOf(UnrecoverableError)
  })

  test("rethrows a storage read error so the job is retried", async () => {
    const failure = new FileFetchError("Failed to read the file from storage")
    mocks.extractKnowledgeDocument.mockRejectedValue(failure)

    const error = await processAIFile({
      aiFileId: "ai-file-1",
      runId: "run-1",
    }).catch((caught: unknown) => caught)

    expect(error).toBe(failure)
    expect(error).not.toBeInstanceOf(UnrecoverableError)
    expect(mocks.reconcilePendingChunks).not.toHaveBeenCalled()
  })

  test("fails an empty extraction instead of wiping the existing chunks", async () => {
    mocks.extractKnowledgeDocument.mockResolvedValue({
      kind: "prose",
      text: "",
    })

    const error = await processAIFile({
      aiFileId: "ai-file-1",
      runId: "run-1",
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AIFileProcessingError)
    expect((error as AIFileProcessingError).code).toBe("noExtractableContent")
    expect(error).toBeInstanceOf(UnrecoverableError)
    expect(mocks.reconcilePendingChunks).not.toHaveBeenCalled()
    expect(mocks.markChunked).not.toHaveBeenCalled()
    expect(mocks.markProcessingRunSucceeded).not.toHaveBeenCalled()
    expect(mocks.addBulk).not.toHaveBeenCalled()
  })

  test("records chunking metadata before queueing pending embeddings", async () => {
    mocks.reconcilePendingChunks.mockResolvedValue([{ id: "123" }])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.markChunked).toHaveBeenCalledWith(
      expect.objectContaining({
        aiFileId: "ai-file-1",
        workspaceId: "workspace-1",
        chunking: expect.objectContaining({
          strategy: "prose",
          chunkerVersion: 1,
          chunkCount: 1,
        }),
      }),
    )
    expect(mocks.markChunked.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.addBulk.mock.invocationCallOrder[0] as number,
    )
  })

  test("keeps prose chunks and their ids identical to the legacy chunker", async () => {
    const text = Array.from({ length: 2600 }, (_, index) =>
      String(index % 10),
    ).join("")
    mocks.extractKnowledgeDocument.mockResolvedValue({ kind: "prose", text })
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1" })

    // Legacy 1000/200 windows over 2600 characters: [0,1000), [800,1800), [1600,2600).
    const expected = [
      text.slice(0, 1000),
      text.slice(800, 1800),
      text.slice(1600, 2600),
    ].map((content, chunkIndex) => ({
      chunkIndex,
      content,
      id: legacyEmbeddingId(chunkIndex, content),
    }))
    expect(reconciledChunks()).toEqual(expected)
    expect(mocks.markChunked).toHaveBeenCalledWith(
      expect.objectContaining({
        chunking: expect.objectContaining({
          strategy: "prose",
          chunkSize: 1000,
          overlapSize: 200,
          chunkCount: 3,
        }),
      }),
    )
  })

  test("chunks tabular documents by row and records the tabular strategy", async () => {
    mocks.extractKnowledgeDocument.mockResolvedValue({
      kind: "tabular",
      sheets: [
        {
          name: "Prices",
          headers: ["Product", "Price"],
          rows: [["Basic", "199000"]],
        },
      ],
      truncated: false,
    })
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.extractKnowledgeDocument).toHaveBeenCalledWith(
      "knowledge/file.pdf",
      "application/pdf",
      expect.objectContaining({ sourceName: "file.pdf" }),
    )
    expect(reconciledChunks().map((chunk) => chunk.content)).toEqual([
      "Sheet: Prices\n\nProduct: Basic\nPrice: 199000",
    ])
    expect(mocks.markChunked).toHaveBeenCalledWith({
      aiFileId: "ai-file-1",
      workspaceId: "workspace-1",
      chunking: {
        strategy: "tabular",
        chunkerVersion: 1,
        chunkSize: 1000,
        overlapSize: 0,
        chunkCount: 1,
        processedAt: expect.any(String),
        extractedChars: 23,
      },
    })
    expect(mocks.loggerWarn).not.toHaveBeenCalled()
  })

  test("passes the stored chunking parameters to extraction and chunking", async () => {
    mocks.findFileOrFail.mockResolvedValue({
      ...aiFile,
      chunkingConfig: {
        strategy: "prose",
        chunkSize: 300,
        overlapSize: 50,
        tabularHeaderRow: 3,
      },
    })
    mocks.extractKnowledgeDocument.mockResolvedValue({
      kind: "prose",
      text: "x".repeat(700),
    })
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.extractKnowledgeDocument).toHaveBeenCalledWith(
      "knowledge/file.pdf",
      "application/pdf",
      expect.objectContaining({ forceProse: true, tabularHeaderRow: 3 }),
    )
    expect(mocks.markChunked).toHaveBeenCalledWith(
      expect.objectContaining({
        chunking: expect.objectContaining({
          strategy: "prose",
          chunkSize: 300,
          overlapSize: 50,
          extractedChars: 700,
        }),
      }),
    )
  })

  test("falls back to the defaults for a malformed stored config", async () => {
    mocks.findFileOrFail.mockResolvedValue({
      ...aiFile,
      chunkingConfig: { chunkSize: "huge" },
    })
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.extractKnowledgeDocument).toHaveBeenCalledWith(
      "knowledge/file.pdf",
      "application/pdf",
      expect.objectContaining({ forceProse: false, tabularHeaderRow: 1 }),
    )
    expect(mocks.markChunked).toHaveBeenCalledWith(
      expect.objectContaining({
        chunking: expect.objectContaining({
          chunkSize: 1000,
          overlapSize: 200,
        }),
      }),
    )
  })

  test("chunks markdown documents by heading and records the markdown strategy", async () => {
    mocks.extractKnowledgeDocument.mockResolvedValue({
      kind: "markdown",
      text: "# Policy\n## Returns\nKeep the receipt.",
    })
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(reconciledChunks().map((chunk) => chunk.content)).toEqual([
      "Policy > Returns\nKeep the receipt.",
    ])
    expect(mocks.markChunked).toHaveBeenCalledWith(
      expect.objectContaining({
        chunking: expect.objectContaining({
          strategy: "markdown",
          chunkerVersion: 1,
          chunkCount: 1,
        }),
      }),
    )
  })

  test("logs a structured-extraction fallback with context and records prose", async () => {
    const failure = new Error("table build failed")
    mocks.extractKnowledgeDocument.mockResolvedValue({
      kind: "prose",
      text: "Product: Basic",
      fallback: { reason: "tabularParseFailed", error: failure },
    })
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({ message: "table build failed" }),
        aiFileId: "ai-file-1",
        workspaceId: "workspace-1",
        mimeType: "application/pdf",
        reason: "tabularParseFailed",
      }),
      expect.any(String),
    )
    expect(mocks.markChunked).toHaveBeenCalledWith(
      expect.objectContaining({
        chunking: expect.objectContaining({ strategy: "prose", chunkCount: 1 }),
      }),
    )
  })

  test("logs truncated tabular extraction with counts only", async () => {
    mocks.extractKnowledgeDocument.mockResolvedValue({
      kind: "tabular",
      sheets: [
        { name: "A", headers: ["SKU"], rows: [["1"], ["2"]] },
        { name: "B", headers: ["SKU"], rows: [["3"]] },
      ],
      truncated: true,
    })
    mocks.reconcilePendingChunks.mockResolvedValue([])

    await processAIFile({ aiFileId: "ai-file-1" })

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        aiFileId: "ai-file-1",
        workspaceId: "workspace-1",
        sheetCount: 2,
        rowCount: 3,
      },
      expect.any(String),
    )
  })
})
